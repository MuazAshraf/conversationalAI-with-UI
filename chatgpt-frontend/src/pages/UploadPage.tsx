import { useState, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { Upload, FileText, X, CheckCircle, FileSpreadsheet, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { apiService } from '../services/api'
import { setMode, setSelectedFileId, setCsvFiles } from '../store/slices/chatSlice'

interface Namespace {
  id: string
  name: string
  document_count: number
}

interface UploadPageProps {
  namespaces: Namespace[]
  onUpload: (files: File[], namespace: string, category?: string, tags?: string) => Promise<void>
  isUploading: boolean
  onRefreshNamespaces?: () => void
}

const UploadPage = ({ namespaces, onUpload, isUploading, onRefreshNamespaces }: UploadPageProps) => {
  const dispatch = useDispatch()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [newNamespace, setNewNamespace] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadType, setUploadType] = useState<'pinecone' | 'csv'>('pinecone')
  const [isUploadingCsv, setIsUploadingCsv] = useState(false)
  const [deletingNamespace, setDeletingNamespace] = useState<string | null>(null)
  const [tags, setTags] = useState<string>('')
  const [category, setCategory] = useState<string>('general')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDeleteNamespace = async (namespace: string) => {
    if (!confirm(`Are you sure you want to delete "${namespace}"? This will remove all documents in this namespace.`)) {
      return
    }

    setDeletingNamespace(namespace)
    try {
      await apiService.deleteNamespace(namespace)
      if (selectedNamespace === namespace) {
        setSelectedNamespace('')
      }
      onRefreshNamespaces?.()
    } catch (error: any) {
      alert(`Failed to delete namespace: ${error.message}`)
    } finally {
      setDeletingNamespace(null)
    }
  }

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

    // CSV/Excel upload
    if (uploadType === 'csv') {
      setIsUploadingCsv(true)
      try {
        for (const file of selectedFiles) {
          const response = await apiService.uploadCsvFile(file)
          console.log('CSV file uploaded:', response.data)
        }

        // Reload CSV files list
        const filesResponse = await apiService.getCsvFiles()
        dispatch(setCsvFiles(filesResponse.data.files || []))

        // Switch to CSV mode and select the last uploaded file
        dispatch(setMode('csv'))
        if (filesResponse.data.files && filesResponse.data.files.length > 0) {
          const lastFile = filesResponse.data.files[filesResponse.data.files.length - 1]
          dispatch(setSelectedFileId(lastFile.id))
        }

        alert(`Successfully uploaded ${selectedFiles.length} CSV/Excel file(s)!`)
        setSelectedFiles([])
      } catch (error: any) {
        console.error('CSV upload failed:', error)
        alert(`Upload failed: ${error.message || 'Unknown error'}`)
      } finally {
        setIsUploadingCsv(false)
      }
    }
    // Pinecone document upload
    else {
      const namespace = selectedNamespace || newNamespace
      if (!namespace) {
        alert('Please select or enter a namespace')
        return
      }

      try {
        await onUpload(selectedFiles, namespace, category, tags)
        setSelectedFiles([])
        setSelectedNamespace('')
        setNewNamespace('')
        setTags('')
        setCategory('general')
      } catch (error) {
        console.error('Upload failed:', error)
      }
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Files</h1>
        <p className="text-gray-600">Upload documents or data files for AI-powered analysis</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Upload Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Upload Type:
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border-2 transition-colors bg-blue-50 border-blue-500">
              <input
                type="radio"
                name="uploadType"
                value="pinecone"
                checked={uploadType === 'pinecone'}
                onChange={() => setUploadType('pinecone')}
                className="w-4 h-4 text-blue-600"
              />
              <FileText className="w-5 h-5 text-blue-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">Documents (Pinecone)</div>
                <div className="text-xs text-gray-500">PDF, TXT</div>
              </div>
            </label>

            <label className={cn(
              "flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border-2 transition-colors",
              uploadType === 'csv' ? 'bg-green-50 border-green-500' : 'border-gray-300 hover:border-gray-400'
            )}>
              <input
                type="radio"
                name="uploadType"
                value="csv"
                checked={uploadType === 'csv'}
                onChange={() => setUploadType('csv')}
                className="w-4 h-4 text-green-600"
              />
              <FileSpreadsheet className={cn("w-5 h-5", uploadType === 'csv' ? 'text-green-600' : 'text-gray-600')} />
              <div className="text-left">
                <div className="font-medium text-gray-900">Data Files (CSV/Excel)</div>
                <div className="text-xs text-gray-500">CSV, XLS, XLSX</div>
              </div>
            </label>
          </div>
        </div>

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
              accept={uploadType === 'csv' ? '.csv,.xls,.xlsx' : '.pdf,.txt'}
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />

            <p className="text-lg font-medium text-gray-900 mb-2">
              {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : 'Choose files or drag and drop'}
            </p>

            <p className="text-sm text-gray-500 mb-4">
              {uploadType === 'csv'
                ? 'CSV, XLS, XLSX files up to 16MB each'
                : 'PDF, TXT files up to 16MB each'
              }
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

        {/* Namespace Selection - Only for Pinecone uploads */}
        {uploadType === 'pinecone' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select existing namespace:
              </label>
              {namespaces.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {namespaces.map((namespace) => (
                    <div
                      key={namespace.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                        selectedNamespace === namespace.name
                          ? "bg-blue-100 border-2 border-blue-500"
                          : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                      )}
                      onClick={() => {
                        setSelectedNamespace(namespace.name)
                        setNewNamespace('')
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          selectedNamespace === namespace.name ? "bg-blue-500" : "bg-gray-300"
                        )} />
                        <span className="font-medium text-gray-900">{namespace.name}</span>
                        <span className="text-sm text-gray-500">({namespace.document_count} vectors)</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteNamespace(namespace.name)
                        }}
                        disabled={deletingNamespace === namespace.name}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete namespace"
                      >
                        {deletingNamespace === namespace.name ? (
                          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">No namespaces yet. Create one below.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or create a new namespace:
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

            {/* Category Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="general">General</option>
                <option value="compliance">Compliance</option>
                <option value="legal">Legal</option>
                <option value="technical">Technical</option>
                <option value="medical">Medical</option>
                <option value="financial">Financial</option>
                <option value="hr">HR / Policy</option>
                <option value="research">Research</option>
              </select>
            </div>

            {/* Tags Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (comma separated):
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., healthcare, privacy, regulations"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Add tags to help organize and filter documents</p>
            </div>
          </>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={
            (isUploading || isUploadingCsv) ||
            selectedFiles.length === 0 ||
            (uploadType === 'pinecone' && !selectedNamespace && !newNamespace)
          }
          className={cn(
            "w-full py-3 px-4 rounded-lg font-medium transition-colors",
            (isUploading || isUploadingCsv) ||
            selectedFiles.length === 0 ||
            (uploadType === 'pinecone' && !selectedNamespace && !newNamespace)
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : uploadType === 'csv'
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {(isUploading || isUploadingCsv) ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Uploading...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              {uploadType === 'csv' ? 'Upload to Database' : 'Upload to Pinecone'}
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

export default UploadPage
