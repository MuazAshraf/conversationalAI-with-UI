import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider, useDispatch } from 'react-redux'
import { store } from './store/store'
import { setConversations } from './store/slices/conversationSlice'
import ChatInterface from './components/chat/ChatInterface'
import Sidebar from './components/sidebar/Sidebar'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import { apiService } from './services/api'
import { Namespace } from './types'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent() {
  const dispatch = useDispatch()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState('home')
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // Load namespaces and conversations on component mount
  useEffect(() => {
    const loadInitialData = async () => {
      // Load namespaces
      try {
        const response = await apiService.getNamespaces()

        // Use namespaces_with_stats if available, otherwise fall back to namespaces
        if (response.data.namespaces_with_stats) {
          const namespaceList = response.data.namespaces_with_stats.map((ns: any, index: number) => ({
            id: `namespace_${index}`,
            name: ns.name,
            document_count: ns.vector_count || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
          setNamespaces(namespaceList)
        } else {
          const namespaceList = (response.data.namespaces || []).map((name: string, index: number) => ({
            id: `namespace_${index}`,
            name: name,
            document_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))
          setNamespaces(namespaceList)
        }
      } catch (error) {
        console.error('Failed to load namespaces:', error)
      }

      // Load conversations
      try {
        const response = await apiService.getConversations()
        dispatch(setConversations(response.data.conversations || []))
      } catch (error) {
        console.error('Failed to load conversations:', error)
      }
    }
    loadInitialData()
  }, [dispatch])

  const handleUpload = async (files: File[], namespace: string) => {
    setIsUploading(true)
    try {
      // Check if namespace exists
      const existingNamespaces = namespaces.map(ns => ns.name)
      const isNewNamespace = !existingNamespaces.includes(namespace)

      // Upload files one by one to match backend's single file upload
      for (const file of files) {
        const response = await apiService.uploadDocument(file, namespace, isNewNamespace)
        console.log('Upload successful:', response.data)
      }

      // Reload namespaces after successful upload
      const namespacesResponse = await apiService.getNamespaces()

      // Use namespaces_with_stats if available, otherwise fall back to namespaces
      if (namespacesResponse.data.namespaces_with_stats) {
        const namespaceList = namespacesResponse.data.namespaces_with_stats.map((ns: any, index: number) => ({
          id: `namespace_${index}`,
          name: ns.name,
          document_count: ns.vector_count || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
        setNamespaces(namespaceList)
      } else {
        const namespaceList = (namespacesResponse.data.namespaces || []).map((name: string, index: number) => ({
          id: `namespace_${index}`,
          name: name,
          document_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
        setNamespaces(namespaceList)
      }

      alert(`Successfully uploaded ${files.length} file(s) to namespace "${namespace}"`)
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />
      case 'upload':
        return (
          <UploadPage 
            namespaces={namespaces}
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        )
      case 'chat':
        return <ChatInterface />
      default:
        return <HomePage />
    }
  }

  return (
    <Router>
      <div className="flex h-screen bg-white">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-auto">
          {renderCurrentPage()}
        </main>
      </div>
    </Router>
  )
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </Provider>
  )
}

export default App