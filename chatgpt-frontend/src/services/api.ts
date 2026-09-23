import axios from 'axios'

const API_BASE_URL = 'http://localhost:5000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('❌ API Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.data || error.message)
    // Return a more detailed error
    const errorMessage = error.response?.data?.error || error.message || 'Network error'
    return Promise.reject(new Error(errorMessage))
  }
)

// API endpoints
export const apiService = {
  // Health check
  healthCheck: () => api.get('/health'),

  // Chat endpoint - supports both Pinecone and CSV modes
  ask: (data: {
    mode?: 'pinecone' | 'csv';
    namespace?: string;
    file_id?: string;
    thread_id?: string;
    enabled_tools?: Array<'customer_support' | 'content_optimizer'>;
    messages: Array<{ question: string }>
  }) => api.post('/ask', data),

  // Get all namespaces
  getNamespaces: () => api.get('/namespaces'),

  // Delete a namespace
  deleteNamespace: (namespace: string) => api.delete(`/namespaces/${namespace}`),

  // Upload document to namespace
  uploadDocument: (file: File, namespace: string, createNew: boolean = false, category?: string, tags?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('namespace', namespace)
    formData.append('create_new', createNew.toString())
    if (category) formData.append('category', category)
    if (tags) formData.append('tags', tags)

    return api.post('/upload_documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Legacy query endpoint wrapper for compatibility
  query: (data: { query: string; thread_id?: string; namespace?: string }) =>
    api.post('/ask', {
      namespace: data.namespace || 'default_namespace',
      thread_id: data.thread_id,
      messages: [{ question: data.query }]
    }),

  // Conversation management - now fully implemented in backend
  getConversations: () => api.get('/conversations'),

  createConversation: (data: { title: string; namespace?: string }) =>
    api.post('/conversations', data),

  getConversation: (id: string) =>
    api.get(`/conversations/${id}`),

  updateConversation: (id: string, data: { title: string }) =>
    api.put(`/conversations/${id}`, data),

  deleteConversation: (id: string) =>
    api.delete(`/conversations/${id}`),

  addMessage: (conversationId: string, data: { role: string; content: string }) =>
    api.post(`/conversations/${conversationId}/messages`, data),

  // CSV/Excel file management
  uploadCsvFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post('/upload_csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  getCsvFiles: () => api.get('/csv_files'),

  loadCsvFile: (fileId: string) => api.get(`/csv_files/${fileId}`),

  deleteCsvFile: (fileId: string) => api.delete(`/csv_files/${fileId}`),
}

export default api
