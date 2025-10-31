'use client'

import { useState } from 'react'
import { useTheme } from './providers/theme-provider'
import FileUpload from './components/FileUpload'
import DocumentProcessor from './components/DocumentProcessor'
import DocumentViewer from './components/DocumentViewer'
import { PlaceholderInfo, PlaceholderData } from './types/placeholders'

export default function Home() {
  const [documentContent, setDocumentContent] = useState<string>('')
  const [placeholders, setPlaceholders] = useState<Map<string, PlaceholderInfo>>(new Map())
  const [completedDocument, setCompletedDocument] = useState<string>('')
  const [filledData, setFilledData] = useState<Map<string, PlaceholderData>>(new Map())
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const { theme, toggleTheme } = useTheme()

  const handleDocumentParsed = (content: string, placeholdersMap: Map<string, PlaceholderInfo>, buffer: ArrayBuffer) => {
    setDocumentContent(content)
    setPlaceholders(placeholdersMap)
    setCompletedDocument('')
    setFilledData(new Map())
    setFileBuffer(buffer)
  }

  const handleDocumentCompleted = (completed: string, filled: Map<string, PlaceholderData>, buffer: ArrayBuffer) => {
    setCompletedDocument(completed)
    setFilledData(filled)
    setFileBuffer(buffer)
  }

      return (
        <main className="min-h-screen bg-white dark:bg-black transition-colors">
          {/* Navbar */}
          <nav className="border-b border-gray-200 dark:border-gray-900 bg-white dark:bg-black">
            <div className="container mx-auto px-4 py-4 max-w-7xl">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Lexsy
                </h1>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-950 hover:bg-gray-200 dark:hover:bg-gray-900 transition-colors"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </nav>

          <div className="container mx-auto px-4 py-8 max-w-7xl">
            {completedDocument ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  {fileBuffer && (
                    <DocumentProcessor
                      documentContent={documentContent}
                      placeholders={placeholders}
                      fileBuffer={fileBuffer}
                      onDocumentCompleted={handleDocumentCompleted}
                    />
                  )}
                  <button
                    onClick={() => {
                      setDocumentContent('')
                      setPlaceholders(new Map())
                      setCompletedDocument('')
                      setFilledData(new Map())
                      setFileBuffer(null)
                    }}
                    className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-950 hover:bg-gray-300 dark:hover:bg-gray-900 rounded-lg transition-colors"
                  >
                    Upload New Document
                  </button>
                </div>
                <div className="lg:order-2">
                  <DocumentViewer content={completedDocument} filledData={filledData} fileBuffer={fileBuffer || undefined} />
                </div>
              </div>
            ) : (
              <div className="flex justify-center items-start min-h-[calc(100vh-200px)]">
                <div className="w-full max-w-3xl">
                  {!documentContent ? (
                    <FileUpload onDocumentParsed={handleDocumentParsed} />
                  ) : (
                    fileBuffer && (
                      <DocumentProcessor
                        documentContent={documentContent}
                        placeholders={placeholders}
                        fileBuffer={fileBuffer}
                        onDocumentCompleted={handleDocumentCompleted}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      )
}

