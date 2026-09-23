#STEP 1
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
from langchain import hub
from langchain.agents import create_tool_calling_agent
from langchain.agents import AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools.retriever import create_retriever_tool
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_tavily import TavilySearch
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langgraph.graph import MessagesState, StateGraph
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver
from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os, uuid
from dotenv import load_dotenv
from langchain.agents.agent_types import AgentType
from langchain_experimental.agents.agent_toolkits import create_pandas_dataframe_agent
import pandas as pd
from db import conversation_manager, csv_file_manager
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
import time
import hashlib
from collections import OrderedDict
# MySQL Database Connection
from datetime import datetime
import json
from flask_cors import CORS
from dotenv import load_dotenv

#STEP 2
# Initialize Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'csv', 'xls', 'xlsx'}


# Configure CORS
CORS(app, origins=["http://localhost:3000", "http://localhost:5173"],
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Load environment variables (if any)
load_dotenv('.env')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
PINECONE_API_KEY = os.getenv('PINECONE_API_KEY')
PINECONE_API_ENV = os.getenv('PINECONE_API_ENV')
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY')
LANGCHAIN_API_KEY = os.getenv('LANGCHAIN_API_KEY')
LANGCHAIN_TRACING_V2 = os.getenv('LANGCHAIN_TRACING_V2')
LANGCHAIN_PROJECT = os.getenv('LANGCHAIN_PROJECT')

# Add these global variables
SEARCH_CACHE = OrderedDict()
EMBEDDING_CACHE = {}
BM25_CACHE = {}
CACHE_TTL = 300  # 5 minutes cache
MAX_CACHE_SIZE = 100

# Add global cache performance counters
CACHE_HITS = 0
CACHE_MISSES = 0

# Initialize message history
message_history = ChatMessageHistory()

# Initialize language model
llm = ChatOpenAI(
    model='gpt-5.2',
    temperature=0.3,
    n=1,
    seed=42,
    top_p=0.95,
    # reasoning_effort="medium"
)
# Initialize Pinecone# Initialize Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index("testing")

# Instantiate the Embedding Model and Pinecone index
embeddings = OpenAIEmbeddings()
# Define a global variable to store the current namespace
current_namespace = "default_namespace"


# Cache utility functions
def get_cache_key(query, namespace, step):
    """Create a cache key for different pipeline steps"""
    query_clean = query.lower().strip()[:100]  # Limit query length for cache key
    return f"{namespace}_{step}_{hashlib.md5(query_clean.encode()).hexdigest()}"

def should_invalidate_cache(namespace, query):
    """Determine if cache should be invalidated"""
    # Invalidate if query contains these high-priority keywords
    critical_keywords = ['latest', 'recent', '2025', 'current', 'new', 'today', 'now']
    return any(keyword in query.lower() for keyword in critical_keywords)

def track_cache_performance():
    """Track and display cache performance metrics"""
    global CACHE_HITS, CACHE_MISSES
    cache_hit_rate = CACHE_HITS / (CACHE_HITS + CACHE_MISSES) * 100 if (CACHE_HITS + CACHE_MISSES) > 0 else 0
    print(f"📊 Cache Performance: {cache_hit_rate:.1f}% hit rate")
    print(f"   Hits: {CACHE_HITS}, Misses: {CACHE_MISSES}")
    print(f"   Cache Size: {len(SEARCH_CACHE)}/{MAX_CACHE_SIZE}")
    return {"hit_rate": cache_hit_rate, "hits": CACHE_HITS, "misses": CACHE_MISSES}

def get_all_namespaces():
    """Get all existing namespaces from Pinecone index"""
    try:
        stats = pinecone_index.describe_index_stats()
        return list(stats.namespaces.keys())
    except Exception as e:
        return []

@app.route('/namespaces', methods=['GET'])
def list_namespaces():
    """Get all available namespaces with their document counts"""
    try:
        stats = pinecone_index.describe_index_stats()
        namespaces_data = []

        for namespace, namespace_stats in stats.namespaces.items():
            namespaces_data.append({
                "name": namespace,
                "vector_count": namespace_stats.vector_count
            })

        return jsonify({
            "namespaces": list(stats.namespaces.keys()),
            "namespaces_with_stats": namespaces_data
        }), 200
    except Exception as e:
        return jsonify({"namespaces": [], "namespaces_with_stats": [], "error": str(e)}), 500

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload_documents', methods=['POST'])
def upload_document():
    try:
        namespace = request.form.get('namespace')
        create_new = request.form.get('create_new', 'false').lower() == 'true'
        
        if not namespace:
            return jsonify({"error": "Namespace is required"}), 400
            
        if not create_new and namespace not in get_all_namespaces():
            return jsonify({"error": "Namespace does not exist"}), 400
        
        # Use the correct initialization pattern from documentation
        vector_store = PineconeVectorStore(
            index=pinecone_index,  # Pass the index object directly
            embedding=embeddings,
            namespace=namespace
        )
        
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Store original filename without extension as title
            doc_title = os.path.splitext(filename)[0]
            
            # Load document based on file type
            extension = filename.rsplit('.', 1)[1].lower()
            if extension == 'pdf':
                loader = PyPDFLoader(filepath)
            elif extension == 'txt':
                loader = TextLoader(filepath)
                
            docs = loader.load()
            
            # Split and index documents
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000, 
                chunk_overlap=200
            )
            splits = text_splitter.split_documents(docs)
            
            # Add enhanced metadata to each chunk
            chunks_metadata = []
            for i, split in enumerate(splits):
                chunk_id = str(uuid.uuid4())

                # Enhanced metadata for better retrieval and filtering
                split.metadata.update({
                    # Document identifiers
                    'doc_id': chunk_id,
                    'doc_title': doc_title,
                    'original_filename': filename,
                    'file_type': extension,

                    # Chunk information
                    'chunk_index': i + 1,
                    'total_chunks': len(splits),
                    'chunk_size': len(split.page_content),

                    # Timestamps
                    'uploaded_at': datetime.now().isoformat(),
                    'indexed_date': datetime.now().strftime('%Y-%m-%d'),

                    # Namespace and categorization
                    'namespace': namespace,
                    'category': request.form.get('category', 'general'),  # Optional category
                    'tags': request.form.get('tags', '').split(',') if request.form.get('tags') else [],

                    # Source information (useful for citations)
                    'source': f"{doc_title} (page {split.metadata.get('page', 'unknown')})" if 'page' in split.metadata else doc_title,

                    # Content preview for debugging
                    'content_preview': split.page_content[:100] + '...' if len(split.page_content) > 100 else split.page_content,

                    # Version tracking (useful for document updates)
                    'version': '1.0',
                    'is_active': True  # Can be used to soft-delete chunks
                })

                chunks_metadata.append({
                    'id': chunk_id,
                    'title': doc_title,
                    'chunk_index': i + 1,
                    'preview': split.metadata['content_preview']
                })
            
            if not splits:
                return jsonify({"error": "Document contains no text to embed."}), 400

            vector_store.add_documents(splits)
            
            return jsonify({
                "message": f"Successfully uploaded and indexed {len(splits)} chunks",
                "document_title": doc_title,
                "filename": filename,
                "total_chunks": len(splits),
                "chunks": chunks_metadata
            }), 201
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
    finally:
        if 'filepath' in locals():
            os.remove(filepath)  # Clean up uploaded file


# Initialize web search tool
web_search_tool = TavilySearch(description="Search the 2025 latest internet information user asked and current events on the topic", k=3)


prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a Super Intelligent AI & Multilingual & Knowledgeable assistant.
LANGUAGE DETECTION & RESPONSE:
1. Automatically detect the language of user's input
2. ALWAYS respond in the SAME language:
   - English input → English response
   - Urdu (اردو) input → Urdu response
   - Roman Urdu input (e.g. "aap kaise hain", "yeh kya hai") → Roman Urdu response
   - Mixed languages → respond in the dominant language

3. Maintain the same tone and formality level as the user
4. You are a E-Lawyer, so you are very knowledgeable about the laws and regulations of Pakistan. You will provide ACCURATE Information according to the User query and provide the sources of the information you provide in the response.
5. IMPORTANT Always use the retrieve_documents tool FIRST to search for information before answering any question. Only provide answers based on retrieved documents, but translate them naturally into the user's language."""),

    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


# Helper functions for parallel processing
def direct_pinecone_search(query, namespace, k=20):
    """Direct Pinecone query for faster retrieval"""
    try:
        cache_key = get_cache_key(query, namespace, "direct_search")
        if cache_key in EMBEDDING_CACHE:
            query_embedding, cached_time = EMBEDDING_CACHE[cache_key]
            if time.time() - cached_time < CACHE_TTL:
                print(f"   🎯 Using cached embedding")
            else:
                query_embedding = embeddings.embed_query(query)
                EMBEDDING_CACHE[cache_key] = (query_embedding, time.time())
        else:
            query_embedding = embeddings.embed_query(query)
            EMBEDDING_CACHE[cache_key] = (query_embedding, time.time())
        
        results = pinecone_index.query(
            namespace=namespace,
            vector=query_embedding,
            top_k=k,
            include_metadata=True
        )
        
        docs = []
        for match in results.matches:
            doc_content = match.metadata.get('text', match.metadata.get('content', ''))
            if doc_content:
                doc = Document(
                    page_content=doc_content,
                    metadata=match.metadata
                )
                docs.append(doc)
        return docs
    except Exception as e:
        print(f"   ✗ Direct Pinecone search error: {e}")
        return []

def create_bm25_retriever_fast(docs, k=20):
    """Create BM25 retriever with caching"""
    try:
        # Filter valid documents
        valid_docs = [doc for doc in docs if doc.page_content and doc.page_content.strip()]
        if not valid_docs:
            return None
        
        # Create BM25 retriever
        bm25_retriever = BM25Retriever.from_documents(valid_docs, k=k)
        return bm25_retriever
    except Exception as e:
        print(f"   ✗ BM25 creation error: {e}")
        return None

def semantic_search_fast(query, vector_store, k=10):
    """Fast semantic search retriever"""
    try:
        semantic_retriever = vector_store.as_retriever(search_kwargs={"k": k})
        return semantic_retriever
    except Exception as e:
        print(f"   ✗ Semantic search error: {e}")
        return None

def create_retriever_tool_for_namespace(namespace):
    """Create retriever tool for a specific namespace"""
    # Store retrieved documents with citations for this namespace
    retrieved_citations = []

    # Check namespace statistics
    stats = pinecone_index.describe_index_stats()
    namespace_stats = stats.namespaces.get(namespace, None)

    if namespace_stats:
        print(f"Namespace '{namespace}' has {namespace_stats.vector_count} vectors")

    # Pass the index object directly, not just the name
    vector_store = PineconeVectorStore(
        index=pinecone_index,  # Pass the index object directly
        embedding=embeddings,
        namespace=namespace,
        text_key="text"  # This is the key - your metadata uses "text" field
    )
    search_kwargs = {
        "k": 5,
    }
    standard_retriever = vector_store.as_retriever(search_kwargs=search_kwargs)

    # MAIN RETRIEVAL FUNCTION - HYBRID SEARCH
    def retrieve_with_hybrid_search(query: str) -> str:
        global CACHE_HITS, CACHE_MISSES
        
        print(f"\n=== HYBRID RETRIEVAL (Semantic + BM25) ===")
        print(f"Query: {query}")
        print(f"Namespace: {namespace}")

        # Clear previous citations for new query
        retrieved_citations.clear()

        try:
            # CHECK CACHE FIRST (with smart invalidation)
            cache_key = get_cache_key(query, namespace, "hybrid_search")
            if not should_invalidate_cache(namespace, query) and cache_key in SEARCH_CACHE:
                cached_result, cached_time = SEARCH_CACHE[cache_key]
                if time.time() - cached_time < CACHE_TTL:
                    print(f"🎯 CACHE HIT: Using cached hybrid search result")
                    CACHE_HITS += 1
                    track_cache_performance()
                    # Update cache position (LRU)
                    SEARCH_CACHE.move_to_end(cache_key)
                    return cached_result
                else:
                    print(f"⏰ Cache expired for this query")
            
            # If not cached, proceed with parallel processing
            print("🔄 CACHE MISS: Running parallel hybrid search...")
            CACHE_MISSES += 1
            # Check if namespace exists and has documents
            stats = pinecone_index.describe_index_stats()
            if namespace not in stats.namespaces:
                print(f"✗ Namespace '{namespace}' does not exist")
                return f"No documents in namespace '{namespace}'"

            namespace_stats = stats.namespaces.get(namespace, {})
            vector_count = namespace_stats.get('vector_count', 0)
            print(f"Namespace has {vector_count} vectors")

            if vector_count == 0:
                return "No documents available in the selected namespace."

            # Step 1: Parallel document fetching (LangChain vs Direct Pinecone)
            print("Step 1: Fetching document pool via parallel search...")
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_semantic = executor.submit(vector_store.similarity_search, query, k=50, namespace=namespace)
                future_direct = executor.submit(direct_pinecone_search, query, namespace, 50)
                
                # Wait for both to complete
                semantic_docs, direct_docs = future_semantic.result(), future_direct.result()
                
                # Use the better result (whichever has more documents)
                if len(direct_docs) > len(semantic_docs):
                    all_docs = direct_docs
                    print(f"   Using direct Pinecone results: {len(all_docs)} docs")
                else:
                    all_docs = semantic_docs
                    print(f"   Using LangChain results: {len(all_docs)} docs")

            # If still no results, return early
            if not all_docs:
                return "No documents available in the selected namespace."

            print(f"✓ Retrieved {len(all_docs)} documents via parallel search")

            # Step 2: Parallel BM25 and Semantic retriever creation
            print("Step 2: Creating retrievers in parallel...")
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_bm25 = executor.submit(create_bm25_retriever_fast, all_docs, 20)
                future_semantic = executor.submit(semantic_search_fast, query, vector_store, 10)
                
                bm25_retriever = future_bm25.result()
                semantic_retriever = future_semantic.result()
            
            # Step 3: Create hybrid ensemble retriever and perform search
            print("Step 3: Performing hybrid search (60% semantic, 40% BM25)...")
            if bm25_retriever and semantic_retriever:
                hybrid_retriever = EnsembleRetriever(
                    retrievers=[semantic_retriever, bm25_retriever],
                    weights=[0.6, 0.4]
                )
                retrieved_docs = hybrid_retriever.invoke(query)
            elif semantic_retriever:
                # Fallback to semantic only
                print("   ⚠ BM25 unavailable, using semantic only")
                retrieved_docs = semantic_retriever.invoke(query)
            else:
                # Ultimate fallback to raw documents
                print("   ⚠ Using raw document fallback")
                retrieved_docs = all_docs[:5]

            # Step 4: Process results and prepare response
            if retrieved_docs and len(retrieved_docs) > 0:
                print(f"✓ Hybrid search found {len(retrieved_docs)} documents")

                documents_text = []
                for i, doc in enumerate(retrieved_docs[:5], 1):  # Limit to top 5
                    doc_title = doc.metadata.get('doc_title', f'Document_{i}')
                    print(f"\nDocument {i}: {doc_title}")
                    print(f"Preview: {doc.page_content[:100]}...")

                    # Store citation data with title and source
                    citation_data = {
                        'score': 0.95 - (i * 0.05),  # Approximate score by rank
                        'tags': doc.metadata.get('tags', []),
                        'preview': doc.page_content[:500] + '...' if len(doc.page_content) > 500 else doc.page_content,
                        'title': doc_title,
                        'source': doc.metadata.get('source', doc.metadata.get('original_filename', doc_title))
                    }
                    retrieved_citations.append(citation_data)
                    documents_text.append(doc.page_content)

                result = "\n\n---\n\n".join(documents_text)
                
                # Cache the result BEFORE returning
                if len(SEARCH_CACHE) >= MAX_CACHE_SIZE:
                    SEARCH_CACHE.popitem(last=False)  # Remove oldest (FIFO)
                
                SEARCH_CACHE[cache_key] = (result, time.time())
                print(f"💾 Cached result for future queries")
                track_cache_performance()
                
                return result
            else:
                print("✗ No documents found with hybrid search")
                # FALLBACK to similarity_search_with_score
                print("Falling back to similarity_search_with_score...")
                try:
                    docs_with_scores = vector_store.similarity_search_with_score(query, k=5, namespace=namespace)
                    if docs_with_scores and len(docs_with_scores) > 0:
                        print(f"✓ Fallback found {len(docs_with_scores)} documents")
                        documents_text = []
                        for i, (doc, score) in enumerate(docs_with_scores, 1):
                            doc_title = doc.metadata.get('doc_title', f'Document_{i}')
                            citation_data = {
                                'score': round(1 - score, 3),
                                'tags': doc.metadata.get('tags', []),
                                'preview': doc.page_content[:500] + '...' if len(doc.page_content) > 500 else doc.page_content,
                                'title': doc_title,
                                'source': doc.metadata.get('source', doc.metadata.get('original_filename', doc_title))
                            }
                            retrieved_citations.append(citation_data)
                            documents_text.append(doc.page_content)
                        
                        result = "\n\n---\n\n".join(documents_text)
                        
                        # Cache fallback result
                        if len(SEARCH_CACHE) >= MAX_CACHE_SIZE:
                            SEARCH_CACHE.popitem(last=False)
                        
                        SEARCH_CACHE[cache_key] = (result, time.time())
                        print(f"💾 Cached fallback result")
                        
                        return result
                except Exception as e:
                    print(f"Fallback error: {e}")
                return "No relevant documents found."

        except Exception as e:
            print(f"✗ Error in hybrid search: {str(e)}")
            print("Falling back to similarity search with score...")
            try:
                docs_with_scores = vector_store.similarity_search_with_score(query, k=5, namespace=namespace)
                if docs_with_scores and len(docs_with_scores) > 0:
                    print(f"✓ Ultimate fallback found {len(docs_with_scores)} documents")
                    documents_text = []
                    for i, (doc, score) in enumerate(docs_with_scores, 1):
                        doc_title = doc.metadata.get('doc_title', f'Document_{i}')
                        citation_data = {
                            'score': round(1 - score, 3),
                            'tags': doc.metadata.get('tags', []),
                            'preview': doc.page_content[:200] + '...' if len(doc.page_content) > 200 else doc.page_content,
                            'title': doc_title,
                            'source': doc.metadata.get('source', doc.metadata.get('original_filename', doc_title))
                        }
                        retrieved_citations.append(citation_data)
                        documents_text.append(doc.page_content)
                    
                    result = "\n\n---\n\n".join(documents_text)
                    
                    # Cache ultimate fallback result  
                    if len(SEARCH_CACHE) >= MAX_CACHE_SIZE:
                        SEARCH_CACHE.popitem(last=False)
                    
                    SEARCH_CACHE[cache_key] = (result, time.time())
                    print(f"💾 Cached ultimate fallback result")
                    
                    return result
            except Exception as e:
                print(f"Ultimate fallback error: {e}")
            return "No relevant documents found."

        
    from langchain_core.tools import Tool
    retriever_tool = Tool(
        name="retrieve_documents",
        description="Search and return information from the context you have only.",
        func=retrieve_with_hybrid_search  # Using hybrid search as main method
    )
    print(f"✓ Retriever tool created for namespace '{namespace}'")

    # Return both the tool and a function to get citations
    return retriever_tool, lambda: retrieved_citations

def create_agent_for_namespace(namespace):
    """Create agent with tools for a specific namespace"""

    retriever_tool, get_citations = create_retriever_tool_for_namespace(namespace)
    tools = [retriever_tool, web_search_tool]

    # Initialize agent
    agent = create_tool_calling_agent(llm, tools, prompt)

    # Initialize agent executor
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    # Initialize agent with chat history
    agent_with_chat_history = RunnableWithMessageHistory(
        agent_executor,
        lambda session_id: message_history,
        input_messages_key="input",
        history_messages_key="chat_history",
    )

    return agent_with_chat_history, get_citations

#Step 4
@app.route('/ask', methods=['POST'])
def index():
    global csv_agent, current_dataframe, current_namespace

    try:
        data = request.get_json()
        print("\n=== BACKEND /ASK ROUTE DEBUG ===")
        print(f"Raw request data: {data}")

        # Extract common parameters
        mode = data.get("mode", "pinecone")  # 'pinecone' or 'csv'
        thread_id = data.get("thread_id", str(uuid.uuid4()))
        question = data['messages'][0]['question'] if 'messages' in data else data['question']

        print(f"Mode: '{mode}'")
        print(f"Thread ID: '{thread_id}'")
        print(f"Question: '{question}'")

        # MODE 1: CSV/EXCEL CHAT
        if mode == "csv":
            print("\n=== CSV MODE ===")
            file_id = data.get("file_id")

            if not file_id:
                return jsonify({"error": "file_id is required for CSV mode"}), 400

            # Load CSV file from database if not already loaded or different file
            file_data = csv_file_manager.get_file_by_id(file_id)

            if not file_data:
                return jsonify({"error": "CSV/Excel file not found"}), 404

            # Create temporary file from database
            temp_filename = f"{file_data['filename']}.{file_data['file_type']}"
            temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

            try:
                # Write file data to temporary file
                with open(temp_filepath, 'wb') as f:
                    f.write(file_data['file_data'])

                # Load file into pandas DataFrame
                if file_data['file_type'] == 'csv':
                    current_dataframe = pd.read_csv(temp_filepath)
                elif file_data['file_type'] in ['xls', 'xlsx']:
                    current_dataframe = pd.read_excel(temp_filepath)

                # Create pandas agent
                csv_agent = create_pandas_dataframe_agent(
                    ChatOpenAI(temperature=0, model="gpt-4o-mini", api_key=OPENAI_API_KEY),
                    current_dataframe,
                    verbose=True,
                    agent_type=AgentType.OPENAI_FUNCTIONS,
                    allow_dangerous_code=True
                )

                print(f"✓ Loaded CSV/Excel file: {file_data['original_filename']}")

                # Get answer from pandas agent
                result = csv_agent.invoke(question)
                answer = result.get('output', result) if isinstance(result, dict) else str(result)

                print(f"✓ CSV Agent response (first 200 chars): {answer[:200]}...")

                # Store messages in conversation if thread_id is a valid conversation
                if thread_id != 'default' and conversation_manager.get_conversation(thread_id):
                    conversation_manager.add_message(thread_id, 'user', question)
                    conversation_manager.add_message(thread_id, 'assistant', answer, [])

                return jsonify({
                    "response": answer,
                    "status": "success",
                    "mode": "csv",
                    "file_used": file_data['original_filename'],
                    "citations": []  # CSV mode doesn't have citations
                })

            finally:
                # Clean up temporary file
                if os.path.exists(temp_filepath):
                    os.remove(temp_filepath)

        # MODE 2: PINECONE RAG CHAT
        else:
            print("\n=== PINECONE MODE ===")
            namespace = data.get("namespace", "default_namespace")

            # Check available namespaces
            existing_namespaces = get_all_namespaces()

            # Validate namespace exists
            if namespace not in existing_namespaces:
                print(f"ERROR: Namespace '{namespace}' not found in {existing_namespaces}")
                return jsonify({"error": f"Namespace '{namespace}' does not exist"}), 404

            print(f"✓ Namespace '{namespace}' exists")

            # Set the global namespace for this request
            current_namespace = namespace

            # Create agent for this specific namespace
            agent_with_chat_history, get_citations = create_agent_for_namespace(namespace)

            config = {"configurable": {"session_id": thread_id}}

            # Get the agent's response
            print(f"\n=== INVOKING AGENT ===")
            print(f"Sending question to agent in namespace '{namespace}'")

            response = agent_with_chat_history.invoke(
                {"input": question},
                config=config,
            )

            # Extract the relevant content from the response
            if isinstance(response, dict):
                response_content = response.get('output') or response.get('response') or str(response)
            else:
                response_content = str(response)

            print(f"Extracted content (first 200 chars): {response_content[:200]}...")

            # Get the citations that were used
            citations = get_citations()
            if citations:
                for i, citation in enumerate(citations, 1):
                    print(f"Citation {i}: Score={citation['score']}, Tags={citation.get('tags', [])}")

            # Store messages in conversation if thread_id is a valid conversation
            if thread_id != 'default' and conversation_manager.get_conversation(thread_id):
                conversation_manager.add_message(thread_id, 'user', question)
                conversation_manager.add_message(thread_id, 'assistant', response_content, citations)
                conversation_manager.update_conversation(thread_id, namespace=namespace)

            return jsonify({
                "response": response_content,
                "status": "success",
                "mode": "pinecone",
                "namespace_used": namespace,
                "citations": citations
            })

    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500


#conversation Management Routes
@app.route('/conversations', methods=['GET'])
def get_conversations():
    """Get all conversations"""
    try:
        conversations = conversation_manager.get_all_conversations()
        return jsonify({"conversations": conversations}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation with namespace"""
    try:
        data = request.get_json()
        title = data.get('title', 'New Conversation')
        namespace = data.get('namespace', 'default_namespace')
        conversation = conversation_manager.create_conversation(title, namespace)
        return jsonify(conversation), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    """Get a specific conversation"""
    try:
        conversation = conversation_manager.get_conversation(conversation_id)
        if conversation:
            return jsonify(conversation), 200
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<conversation_id>', methods=['PUT'])
def update_conversation(conversation_id):
    """Update a conversation"""
    try:
        data = request.get_json()
        title = data.get('title')
        namespace = data.get('namespace')

        conversation = conversation_manager.update_conversation(
            conversation_id,
            title=title,
            namespace=namespace
        )

        if conversation:
            return jsonify(conversation), 200
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation"""
    try:
        deleted = conversation_manager.delete_conversation(conversation_id)
        if deleted:
            return jsonify({"message": "Conversation deleted", "conversation": deleted}), 200
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<conversation_id>/messages', methods=['POST'])
def add_message(conversation_id):
    """Add a message to a conversation"""
    try:
        data = request.get_json()
        role = data.get('role', 'user')
        content = data.get('content', '')

        message = conversation_manager.add_message(conversation_id, role, content)

        if message:
            return jsonify(message), 201
        else:
            return jsonify({"error": "Conversation not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500




# Global variables to store CSV/Excel agent and dataframe
csv_agent = None
current_dataframe = None

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    """Upload CSV or Excel file for pandas agent analysis and save to database"""
    global csv_agent, current_dataframe

    try:
        # Check if file exists in request
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        # Validate file type using existing allowed_file function
        if not allowed_file(file.filename):
            return jsonify({"error": "Only CSV and Excel files (.csv, .xls, .xlsx) are supported"}), 400

        # Save file temporarily
        original_filename = file.filename
        filename = secure_filename(original_filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        file.save(filepath)

        try:
            # Load file into pandas DataFrame
            if filepath.endswith('.csv'):
                current_dataframe = pd.read_csv(filepath)
            elif filepath.endswith(('.xls', '.xlsx')):
                current_dataframe = pd.read_excel(filepath)

            # Create pandas agent
            csv_agent = create_pandas_dataframe_agent(
                ChatOpenAI(temperature=0, model="gpt-4o-mini", api_key=OPENAI_API_KEY),
                current_dataframe,
                verbose=True,
                agent_type=AgentType.OPENAI_FUNCTIONS,
                allow_dangerous_code=True
            )

            # Get dataframe info
            doc_title = os.path.splitext(filename)[0]
            rows, cols = current_dataframe.shape
            columns = current_dataframe.columns.tolist()

            # Convert preview to JSON-safe format (handle NaN, inf, datetime, etc.)
            preview_df = current_dataframe.head(5).fillna('')  # Replace NaN with empty string
            preview = json.loads(preview_df.to_json(orient='records', date_format='iso'))

            # Read file data to save in database
            with open(filepath, 'rb') as f:
                file_data = f.read()

            # Get file extension
            file_type = filename.rsplit('.', 1)[1].lower()

            # Save to database
            saved_file = csv_file_manager.save_file(
                filename=doc_title,
                original_filename=original_filename,
                file_type=file_type,
                file_data=file_data,
                rows=rows,
                columns=cols,
                column_names=columns,
                preview=preview
            )

            if saved_file:
                return jsonify({
                    "message": f"Successfully loaded and saved {filename}",
                    "file_id": saved_file['id'],
                    "document_title": doc_title,
                    "rows": rows,
                    "columns": cols,
                    "column_names": columns,
                    "preview": preview
                }), 200
            else:
                return jsonify({
                    "message": f"Successfully loaded {filename} (DB save failed)",
                    "document_title": doc_title,
                    "rows": rows,
                    "columns": cols,
                    "column_names": columns,
                    "preview": preview
                }), 200

        finally:
            # Clean up uploaded file
            if os.path.exists(filepath):
                os.remove(filepath)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ask_csv', methods=['POST'])
def ask_csv():
    """Ask questions about the uploaded CSV/Excel data"""
    global csv_agent

    try:
        # Check if agent exists
        if csv_agent is None:
            return jsonify({"error": "No CSV/Excel file uploaded. Please upload a file first using /upload_csv"}), 400

        data = request.get_json()
        question = data.get('question')

        if not question:
            return jsonify({"error": "Question is required"}), 400

        # Get answer from pandas agent
        result = csv_agent.invoke(question)

        # Extract the answer from the result
        answer = result.get('output', result) if isinstance(result, dict) else str(result)

        return jsonify({
            "question": question,
            "answer": answer
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/csv_files', methods=['GET'])
def get_csv_files():
    """Get list of all uploaded CSV/Excel files"""
    try:
        files = csv_file_manager.get_all_files()
        return jsonify({
            "files": files,
            "count": len(files)
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/csv_files/<file_id>', methods=['GET'])
def load_csv_file(file_id):
    """Load a previously uploaded CSV/Excel file from database"""
    global csv_agent, current_dataframe

    try:
        # Get file from database
        file_data = csv_file_manager.get_file_by_id(file_id)

        if not file_data:
            return jsonify({"error": "File not found"}), 404

        # Create temporary file from database
        temp_filename = f"{file_data['filename']}.{file_data['file_type']}"
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

        # Write file data to temporary file
        with open(temp_filepath, 'wb') as f:
            f.write(file_data['file_data'])

        try:
            # Load file into pandas DataFrame
            if file_data['file_type'] == 'csv':
                current_dataframe = pd.read_csv(temp_filepath)
            elif file_data['file_type'] in ['xls', 'xlsx']:
                current_dataframe = pd.read_excel(temp_filepath)

            # Create pandas agent
            csv_agent = create_pandas_dataframe_agent(
                ChatOpenAI(temperature=0, model="gpt-4o-mini", api_key=OPENAI_API_KEY),
                current_dataframe,
                verbose=True,
                agent_type=AgentType.OPENAI_FUNCTIONS,
                allow_dangerous_code=True
            )

            # Remove file_data from response (too large)
            response_data = {k: v for k, v in file_data.items() if k != 'file_data'}
            response_data['message'] = f"Successfully loaded {file_data['original_filename']}"

            return jsonify(response_data), 200

        finally:
            # Clean up temporary file
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/csv_files/<file_id>', methods=['DELETE'])
def delete_csv_file(file_id):
    """Delete a CSV/Excel file from database"""
    try:
        deleted_file = csv_file_manager.delete_file(file_id)

        if deleted_file:
            return jsonify({
                "message": "File deleted successfully",
                "file": deleted_file
            }), 200
        else:
            return jsonify({"error": "File not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/cache_stats', methods=['GET'])
def get_cache_stats():
    """Get cache performance statistics"""
    try:
        stats = track_cache_performance()
        return jsonify({
            "cache_performance": stats,
            "cache_details": {
                "total_cached_queries": len(SEARCH_CACHE),
                "max_cache_size": MAX_CACHE_SIZE,
                "cache_ttl_seconds": CACHE_TTL,
                "embedding_cache_size": len(EMBEDDING_CACHE),
                "bm25_cache_size": len(BM25_CACHE)
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/cache_clear', methods=['POST'])
def clear_cache():
    """Clear all caches"""
    global SEARCH_CACHE, EMBEDDING_CACHE, BM25_CACHE, CACHE_HITS, CACHE_MISSES
    try:
        old_size = len(SEARCH_CACHE)
        SEARCH_CACHE.clear()
        EMBEDDING_CACHE.clear()
        BM25_CACHE.clear()
        CACHE_HITS = 0
        CACHE_MISSES = 0
        
        return jsonify({
            "message": "All caches cleared successfully",
            "cleared_items": old_size
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

