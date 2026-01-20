import "./styles.css"
import { createRoot } from "react-dom/client"
import { useState } from "react"

function App() {
  const [response, setResponse] = useState("")

  const fetchApi = async () => {
    const res = await fetch("/api/hello")
    setResponse(`API: ${await res.text()}`)
  }

  const fetchDO = async () => {
    const res = await fetch("/api/do")
    setResponse(`DO: ${await res.text()}`)
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">Play</h1>
        <p className="text-neutral-400 mb-8">Vite + React + Tailwind + Cloudflare Workers</p>
        <div className="bg-neutral-800 p-4 rounded-lg mb-4 min-h-12">
          {response}
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={fetchApi}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Fetch API
          </button>
          <button
            onClick={fetchDO}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Fetch DO
          </button>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
