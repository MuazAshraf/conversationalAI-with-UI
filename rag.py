#STEP 1
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
from langchain import hub
from langchain.agents import create_tool_calling_agent
from langchain.agents import AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools.retriever import create_retriever_tool
from langchain.text_splitter import RecursiveCharacterTextSplitter
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
from langgraph.graph import END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os, uuid
from dotenv import load_dotenv

#STEP 2
# Initialize Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads/'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {'pdf', 'txt'}

# MySQL Database Configuration
import pymysql
from pymysql.cursors import DictCursor
import json as json_lib

# Configure CORS
from flask_cors import CORS
CORS(app, origins=["http://localhost:3000", "http://localhost:5173"],
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Load environment variables (if any)
from dotenv import load_dotenv
load_dotenv('.env')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
PINECONE_API_KEY = os.getenv('PINECONE_API_KEY')
PINECONE_API_ENV = os.getenv('PINECONE_API_ENV')
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY')
LANGCHAIN_API_KEY = os.getenv('LANGCHAIN_API_KEY')
LANGCHAIN_TRACING_V2 = os.getenv('LANGCHAIN_TRACING_V2')
LANGCHAIN_PROJECT = os.getenv('LANGCHAIN_PROJECT')

# MySQL Configuration
MYSQL_HOST = os.getenv('MYSQL_HOST')
MYSQL_USER = os.getenv('MYSQL_USER')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))

# Initialize message history
message_history = ChatMessageHistory()

# Initialize language model
llm = ChatOpenAI(
    model='gpt-4o-mini',
    temperature=0.8,
    n=1
)
# Initialize Pinecone# Initialize Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index("testing")

# Instantiate the Embedding Model and Pinecone index
embeddings = OpenAIEmbeddings()
# Define a global variable to store the current namespace
current_namespace = "default_namespace"

# MySQL Database Connection
from datetime import datetime
import json

def get_db_connection():
    """Create and return a MySQL database connection"""
    try:
        connection = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DATABASE,
            charset='utf8mb4',
            cursorclass=DictCursor,
            autocommit=True
        )
        return connection
    except pymysql.Error as e:
        print(f"MySQL Connection Error: {e}")
        return None

class ConversationManager:
    def __init__(self):
        """Initialize with MySQL connection test"""
        conn = get_db_connection()
        if conn:
            print("✓ MySQL connection successful")
            conn.close()
        else:
            print("✗ MySQL connection failed - using fallback mode")

    def create_conversation(self, title, namespace='default_namespace'):
        """Create a new conversation in MySQL"""
        conn = get_db_connection()
        if not conn:
            return None

        try:
            cursor = conn.cursor()
            conversation_id = str(uuid.uuid4())

            cursor.execute("""
                INSERT INTO conversations (id, title, namespace)
                VALUES (%s, %s, %s)
            """, (conversation_id, title, namespace))

            return {
                'id': conversation_id,
                'title': title,
                'namespace': namespace,
                'messages': [],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
        except pymysql.Error as e:
            print(f"Error creating conversation: {e}")
            return None
        finally:
            conn.close()

    def get_all_conversations(self):
        """Get all conversations from MySQL"""
        conn = get_db_connection()
        if not conn:
            return []

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT c.*, COUNT(m.id) as message_count
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
            """)
            conversations = cursor.fetchall()

            # Convert datetime objects to ISO format strings
            for conv in conversations:
                if conv['created_at']:
                    conv['created_at'] = conv['created_at'].isoformat()
                if conv['updated_at']:
                    conv['updated_at'] = conv['updated_at'].isoformat()

            return conversations
        except pymysql.Error as e:
            print(f"Error fetching conversations: {e}")
            return []
        finally:
            conn.close()

    def get_conversation(self, conversation_id):
        """Get a specific conversation with messages from MySQL"""
        conn = get_db_connection()
        if not conn:
            return None

        try:
            cursor = conn.cursor()

            # Get conversation details
            cursor.execute("""
                SELECT * FROM conversations WHERE id = %s
            """, (conversation_id,))
            conversation = cursor.fetchone()

            if not conversation:
                return None

            # Get messages for this conversation
            cursor.execute("""
                SELECT m.*,
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT('score', c.score, 'preview', c.preview, 'tags', c.tags)
                    ) FROM citations c WHERE c.message_id = m.id) as citations
                FROM messages m
                WHERE m.conversation_id = %s
                ORDER BY m.timestamp ASC
            """, (conversation_id,))
            messages = cursor.fetchall()

            # Format timestamps
            if conversation['created_at']:
                conversation['created_at'] = conversation['created_at'].isoformat()
            if conversation['updated_at']:
                conversation['updated_at'] = conversation['updated_at'].isoformat()

            for msg in messages:
                if msg['timestamp']:
                    msg['timestamp'] = msg['timestamp'].isoformat()
                # Parse citations JSON string if present
                if msg['citations']:
                    try:
                        msg['citations'] = json.loads(msg['citations'])
                    except:
                        msg['citations'] = []

            conversation['messages'] = messages
            return conversation

        except pymysql.Error as e:
            print(f"Error fetching conversation: {e}")
            return None
        finally:
            conn.close()

    def update_conversation(self, conversation_id, title=None, namespace=None):
        """Update conversation in MySQL"""
        conn = get_db_connection()
        if not conn:
            return None

        try:
            cursor = conn.cursor()

            # Build update query dynamically
            updates = []
            params = []

            if title is not None:
                updates.append("title = %s")
                params.append(title)

            if namespace is not None:
                updates.append("namespace = %s")
                params.append(namespace)

            if not updates:
                return self.get_conversation(conversation_id)

            params.append(conversation_id)
            query = f"UPDATE conversations SET {', '.join(updates)} WHERE id = %s"

            cursor.execute(query, params)

            return self.get_conversation(conversation_id)

        except pymysql.Error as e:
            print(f"Error updating conversation: {e}")
            return None
        finally:
            conn.close()

    def delete_conversation(self, conversation_id):
        """Delete conversation from MySQL (cascade deletes messages)"""
        conn = get_db_connection()
        if not conn:
            return None

        try:
            cursor = conn.cursor()

            # Get conversation before deletion
            deleted = self.get_conversation(conversation_id)

            if deleted:
                cursor.execute("DELETE FROM conversations WHERE id = %s", (conversation_id,))
                return deleted

            return None

        except pymysql.Error as e:
            print(f"Error deleting conversation: {e}")
            return None
        finally:
            conn.close()

    def add_message(self, conversation_id, role, content, citations=None):
        """Add a message to a conversation in MySQL"""
        conn = get_db_connection()
        if not conn:
            return None

        try:
            cursor = conn.cursor()
            message_id = str(uuid.uuid4())

            # Insert message
            cursor.execute("""
                INSERT INTO messages (id, conversation_id, role, content)
                VALUES (%s, %s, %s, %s)
            """, (message_id, conversation_id, role, content))

            # Insert citations if provided
            if citations and len(citations) > 0:
                for citation in citations:
                    cursor.execute("""
                        INSERT INTO citations (message_id, score, preview, tags)
                        VALUES (%s, %s, %s, %s)
                    """, (
                        message_id,
                        citation.get('score', 0),
                        citation.get('preview', ''),
                        json.dumps(citation.get('tags', []))
                    ))

            # Update conversation's updated_at timestamp
            cursor.execute("""
                UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (conversation_id,))

            return {
                'id': message_id,
                'role': role,
                'content': content,
                'timestamp': datetime.now().isoformat()
            }

        except pymysql.Error as e:
            print(f"Error adding message: {e}")
            return None
        finally:
            conn.close()

# Initialize conversation manager
conversation_manager = ConversationManager()

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

# Initialize prompt with modification to always use retriever
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a Super Intelligent AI & Multilingual assistant.
LANGUAGE DETECTION & RESPONSE:
1. Automatically detect the language of user's input
2. ALWAYS respond in the SAME language:
   - English input → English response
   - Urdu (اردو) input → Urdu response
   - Roman Urdu input (e.g. "aap kaise hain", "yeh kya hai") → Roman Urdu response
   - Mixed languages → respond in the dominant language

3. Maintain the same tone and formality level as the user

IMPORTANT: Always use the retrieve_documents tool FIRST to search for information before answering any question. Only provide answers based on retrieved documents, but translate them naturally into the user's language."""),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


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
        print(f"\n=== HYBRID RETRIEVAL (Semantic + BM25) ===")
        print(f"Query: {query}")
        print(f"Namespace: {namespace}")

        # Clear previous citations for new query
        retrieved_citations.clear()

        try:
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

            # Step 1: Fetch pool of documents for BM25 (following advanced_rag.py pattern)
            print("Step 1: Fetching document pool for hybrid search...")
            all_docs = vector_store.similarity_search(query, k=50)

            # If similarity search returns nothing, try direct Pinecone query
            if not all_docs or len(all_docs) == 0:
                print("LangChain search returned nothing, trying direct Pinecone query...")
                query_embedding = embeddings.embed_query(query)
                results = pinecone_index.query(
                    namespace=namespace,
                    vector=query_embedding,
                    top_k=50,
                    include_metadata=True
                )

                # Convert Pinecone results to LangChain Document format
                all_docs = []
                for match in results.matches:
                    doc_content = match.metadata.get('text', match.metadata.get('content', ''))
                    if doc_content:  # Only add if content exists
                        doc = Document(
                            page_content=doc_content,
                            metadata=match.metadata
                        )
                        all_docs.append(doc)

            if not all_docs:
                print("No documents found even with direct query")
                return "No documents available in the selected namespace."

            print(f"✓ Retrieved {len(all_docs)} documents for hybrid search")

            # Step 2: Create semantic retriever
            print("Step 2: Creating semantic retriever...")
            semantic_retriever = vector_store.as_retriever(search_kwargs={"k": 10})

            # Step 3: Create BM25 retriever from fetched documents
            print("Step 3: Creating BM25 retriever...")
            valid_docs = [doc for doc in all_docs if doc.page_content and doc.page_content.strip()]

            if not valid_docs:
                print("No valid documents for BM25, using semantic search only")
                # Fallback to semantic search only
                retrieved_docs = semantic_retriever.invoke(query)
            else:
                bm25_retriever = BM25Retriever.from_documents(valid_docs, k=20)

                # Step 4: Create hybrid ensemble retriever
                print("Step 4: Creating ensemble retriever (60% semantic, 40% BM25)...")
                hybrid_retriever = EnsembleRetriever(
                    retrievers=[semantic_retriever, bm25_retriever],
                    weights=[0.6, 0.4]
                )

                # Step 5: Perform hybrid search
                print("Step 5: Performing hybrid search...")
                retrieved_docs = hybrid_retriever.invoke(query)

            if retrieved_docs and len(retrieved_docs) > 0:
                print(f"✓ Hybrid search found {len(retrieved_docs)} documents")

                documents_text = []
                for i, doc in enumerate(retrieved_docs[:5], 1):  # Limit to top 5
                    doc_title = doc.metadata.get('doc_title', f'Document_{i}')
                    print(f"\nDocument {i}: {doc_title}")
                    print(f"Preview: {doc.page_content[:100]}...")

                    # Store citation data
                    citation_data = {
                        'score': 0.95 - (i * 0.05),  # Approximate score by rank
                        'tags': doc.metadata.get('tags', []),
                        'preview': doc.page_content[:200] + '...' if len(doc.page_content) > 200 else doc.page_content
                    }
                    retrieved_citations.append(citation_data)
                    documents_text.append(doc.page_content)

                return "\n\n---\n\n".join(documents_text)
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
                            citation_data = {
                                'score': round(1 - score, 3),
                                'tags': doc.metadata.get('tags', []),
                                'preview': doc.page_content[:200] + '...' if len(doc.page_content) > 200 else doc.page_content
                            }
                            retrieved_citations.append(citation_data)
                            documents_text.append(doc.page_content)
                        return "\n\n---\n\n".join(documents_text)
                except Exception as e:
                    print(f"Fallback error: {e}")
                return "No relevant documents found."

        except Exception as e:
            print(f"✗ Error in hybrid search: {str(e)}")
            print("Falling back to similarity search with score...")
            try:
                docs_with_scores = vector_store.similarity_search_with_score(query, k=5, namespace=namespace)
                if docs_with_scores and len(docs_with_scores) > 0:
                    print(f"✓ Fallback found {len(docs_with_scores)} documents")
                    documents_text = []
                    for i, (doc, score) in enumerate(docs_with_scores, 1):
                        citation_data = {
                            'score': round(1 - score, 3),
                            'tags': doc.metadata.get('tags', []),
                            'preview': doc.page_content[:200] + '...' if len(doc.page_content) > 200 else doc.page_content
                        }
                        retrieved_citations.append(citation_data)
                        documents_text.append(doc.page_content)
                    return "\n\n---\n\n".join(documents_text)
            except Exception as e:
                print(f"Ultimate fallback error: {e}")
            return "No relevant documents found."

        """
        # COMMENTED OUT OLD METHODS
        # Method 1: Try similarity_search_with_score for better insights
        try:
            print("\n1. Trying similarity_search_with_score...")
            docs_with_scores = vector_store.similarity_search_with_score(
                query,
                k=5,
                namespace=namespace
            )

            if docs_with_scores and len(docs_with_scores) > 0:
                print(f"   ✓ Found {len(docs_with_scores)} documents with scores")

                # Display scores and metadata for debugging
                documents_text = []
                for i, (doc, score) in enumerate(docs_with_scores, 1):
                    # Store citation data for frontend
                    citation_data = {
                        'score': round(1 - score, 3),  # Convert to similarity score (higher is better)
                        'tags': doc.metadata.get('tags', []),
                        'preview': doc.page_content[:200] + '...' if len(doc.page_content) > 200 else doc.page_content
                    }
                    retrieved_citations.append(citation_data)

                    documents_text.append(f"[Score: {score:.3f}] {doc.page_content}")

                result = "\n\n---\n\n".join(documents_text)
                return result
            else:
                print("   ✗ No documents found with similarity_search_with_score")
        except Exception as e:
            print(f"   ✗ Error with similarity_search_with_score: {e}")

        # Method 2: Try regular similarity_search
        try:
            print("\n2. Trying regular similarity_search...")
            docs = vector_store.similarity_search(
                query,
                k=5,
                namespace=namespace
            )

            if docs and len(docs) > 0:
                print(f"   ✓ Found {len(docs)} documents")

                for i, doc in enumerate(docs, 1):
                    print(f"\n   Document {i}:")
                    print(f"   - Title: {doc.metadata.get('doc_title', 'Unknown')}")
                    print(f"   - Preview: {doc.page_content[:100]}...")

                result = "\n\n---\n\n".join([doc.page_content for doc in docs])
                return result
            else:
                print("   ✗ No documents found with similarity_search")
        except Exception as e:
            print(f"   ✗ Error with similarity_search: {e}")

        # Method 3: Try the standard retriever
        try:
            print("\n3. Trying standard LangChain retriever...")
            docs = standard_retriever.invoke(query)
            if docs and len(docs) > 0:
                print(f"   ✓ Standard retriever found {len(docs)} documents")
                result = "\n\n---\n\n".join([doc.page_content for doc in docs])
                return result
            else:
                print("   ✗ Standard retriever returned empty")
        except Exception as e:
            print(f"   ✗ Standard retriever error: {e}")

        # Method 4: Fall back to direct Pinecone query
        print("\n4. Falling back to direct Pinecone query...")
        try:
            # Create embedding for the query
            query_embedding = embeddings.embed_query(query)

            # Query Pinecone directly
            results = pinecone_index.query(
                vector=query_embedding,
                namespace=namespace,
                top_k=5,
                include_metadata=True
            )

            print(f"   ✓ Direct query found {len(results['matches'])} matches")

            if results['matches']:
                # Extract text from metadata with scores
                documents = []
                for i, match in enumerate(results['matches'], 1):
                    score = match['score']
                    print(f"\n   Match {i}:")
                    print(f"   - Score: {score:.4f} (higher is better for cosine similarity)")

                    if 'metadata' in match:
                        # Display available metadata
                        metadata = match['metadata']
                    
                        if 'text' in metadata:
                            text = metadata['text']
                            print(f"   - Preview: {text[:100]}...")
                            documents.append(f"[Score: {score:.3f}] {text}")
                        elif 'page_content' in metadata:
                            text = metadata['page_content']
                            print(f"   - Preview: {text[:100]}...")
                            documents.append(f"[Score: {score:.3f}] {text}")
                        else:
                            print(f"   - Available metadata keys: {list(metadata.keys())}")

                if documents:
                    result = "\n\n---\n\n".join(documents)
                    print(f"\n✓ Returning {len(documents)} documents with scores")
                    return result
                else:
                    print("\n✗ No text content found in document metadata")
                    return "No text content found in documents."
            else:
                print("\n✗ No documents found - query returned empty")
                return "No relevant documents found in the database."

        except Exception as e:
            print(f"\n✗ Error during direct Pinecone search: {e}")
            return f"Error searching documents: {str(e)}"
        """

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
        # This is needed because in most real world scenarios, a session id is needed
        # It isn't really used here because we are using a simple in memory ChatMessageHistory
        lambda session_id: message_history,
        input_messages_key="input",
        history_messages_key="chat_history",
    )

    return agent_with_chat_history, get_citations

#Step 4
@app.route('/ask', methods=['POST'])
def index():
    try:
        data = request.get_json()
        print("\n=== BACKEND /ASK ROUTE DEBUG ===")
        print(f"Raw request data: {data}")

        # Handle nested message format
        namespace = data.get("namespace", "default_namespace")
        thread_id = data.get("thread_id", str(uuid.uuid4()))
        question = data['messages'][0]['question'] if 'messages' in data else data['question']

        print(f"Extracted namespace: '{namespace}'")
        print(f"Thread ID: '{thread_id}'")
        print(f"Question: '{question}'")

        # Check available namespaces
        existing_namespaces = get_all_namespaces()

        # Validate namespace exists
        if namespace not in existing_namespaces:
            print(f"ERROR: Namespace '{namespace}' not found in {existing_namespaces}")
            return jsonify({"error": f"Namespace '{namespace}' does not exist"}), 404

        print(f"✓ Namespace '{namespace}' exists")

        # Set the global namespace for this request
        global current_namespace
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
            # Add user message
            conversation_manager.add_message(thread_id, 'user', question)
            # Add assistant response with citations
            conversation_manager.add_message(thread_id, 'assistant', response_content, citations)
            # Update conversation namespace
            conversation_manager.update_conversation(thread_id, namespace=namespace)

        return jsonify({
            "response": response_content,
            "status": "success",
            "namespace_used": namespace,
            "citations": citations  # Include citations in response
        })
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "error"
        }), 500



# Conversation Management Routes
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)

