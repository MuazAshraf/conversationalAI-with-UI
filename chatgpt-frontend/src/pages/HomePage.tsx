import { FileText, MessageSquare, Upload, Zap } from 'lucide-react'

const HomePage = () => {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to MuazAshraf Services
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          AI-Powered Document Analysis and Chat Platform
        </p>
        <div className="w-24 h-1 bg-blue-600 mx-auto rounded-full"></div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Documents</h3>
          <p className="text-gray-600 text-sm">
            Upload PDF, TXT, CSV, XLS, XLSX files to your knowledge base for AI-powered analysis and search.
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <MessageSquare className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Chat</h3>
          <p className="text-gray-600 text-sm">
            Chat with your documents using advanced AI. Get instant answers and insights.
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Analysis</h3>
          <p className="text-gray-600 text-sm">
            Advanced RAG technology with hybrid retrieval and real-time processing.
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Get Started</h2>
        <p className="text-gray-600 mb-6">
          Upload your documents and start chatting with AI to get instant insights and answers.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span>Upload documents to create your knowledge base</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
            <span>Start chatting with AI about your documents</span>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Features</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span>Support for PDF, TXT, CSV, XLS, XLSX files</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <span>Real-time AI chat with streaming responses</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600" />
            <span>Advanced RAG with hybrid retrieval</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-600" />
            <span>Namespace-based document organization</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
