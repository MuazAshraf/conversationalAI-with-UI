import { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle } from 'lucide-react'
import { cn } from '../lib/utils'

interface Namespace {
  id: string
  name: string
  document_count: number
}

interface UploadPageProps {
  namespaces: Namespace[]
  onUpload: (files: File[], namespace: string) => Promise<void>
  isUploading: boolean
}

const UploadPage = ({ namespaces, onUpload, isUploading }: UploadPageProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [newNamespace, setNewNamespace] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (files: FileList | null) => {
    if (files) {
      const fileArray = Array.from(files)
      setSelectedFiles(prev => [...prev, ...fileArray])
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select files to upload')
      return
    }

    const namespace = selectedNamespace || newNamespace
    if (!namespace) {
      alert('Please select or enter a namespace')
      return
    }

    try {
      await onUpload(selectedFiles, namespace)
      setSelectedFiles([])
      setSelectedNamespace('')
      setNewNamespace('')
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Files to Pinecone</h1>
        <p className="text-gray-600">Upload documents to your knowledge base for AI-powered search</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* File Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select files:
          </label>
          
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive 
                ? "border-blue-500 bg-blue-50" 
                : "border-gray-300 hover:border-gray-400",
              selectedFiles.length > 0 && "border-green-500 bg-green-50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.doc,.docx"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            
            <p className="text-lg font-medium text-gray-900 mb-2">
              {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : 'Choose files or drag and drop'}
            </p>
            
            <p className="text-sm text-gray-500 mb-4">
              PDF, TXT, DOC, DOCX files up to 10MB each
            </p>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Choose files
            </button>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Namespace Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select existing namespace:
          </label>
          <select
            value={selectedNamespace}
            onChange={(e) => {
              setSelectedNamespace(e.target.value)
              setNewNamespace('')
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">None</option>
            {namespaces.map((namespace) => (
              <option key={namespace.id} value={namespace.name}>
                {namespace.name} ({namespace.document_count} vectors)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or enter a new namespace:
          </label>
          <input
            type="text"
            value={newNamespace}
            onChange={(e) => {
              setNewNamespace(e.target.value)
              setSelectedNamespace('')
            }}
            placeholder="Enter new namespace name"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={isUploading || selectedFiles.length === 0 || (!selectedNamespace && !newNamespace)}
          className={cn(
            "w-full py-3 px-4 rounded-lg font-medium transition-colors",
            isUploading || selectedFiles.length === 0 || (!selectedNamespace && !newNamespace)
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Uploading...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              Upload
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

export default UploadPage
