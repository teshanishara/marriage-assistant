import React, { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export default function App(){
  const [persona, setPersona] = useState('female')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [intake, setIntake] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const chatRef = useRef(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages])

  async function startSession(){
    if (!ageConfirmed) { alert('Please confirm age (18+) to continue.'); return }
    try {
      const res = await fetch(`${API_BASE}/start-session`,{
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, ageConfirmed, intake })
      })
      const j = await res.json()
      if (res.ok && j.sessionId) setSessionId(j.sessionId)
      setMessages([{ role: 'system', content: `Session started with ${persona} persona.` }])
    } catch (e) {
      alert('Failed to start session')
    }
  }

  async function sendMessage(){
    if (!sessionId) { alert('Start a session first'); return }
    const text = input.trim(); if (!text) return
    setMessages(m => [...m, { role: 'user', content: text }])
    setInput('')
    try {
      const res = await fetch(`${API_BASE}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text })
      })
      const j = await res.json()
      if (j.reply) setMessages(m => [...m, { role: 'assistant', content: j.reply }])
      else if (j.error) setMessages(m => [...m, { role: 'assistant', content: j.error }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Failed to contact server.' }])
    }
  }

  async function deleteSession(){
    if (!sessionId) return
    try {
      await fetch(`${API_BASE}/delete-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    } catch (e) {}
    setSessionId(null); setMessages([]); setIntake('')
  }

  return (
    <div className="container">
      <div className="header">
        <h2>Marriage Sexual Health Assistant</h2>
        <div className="small">Choose persona:</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <label><input type="radio" name="p" value="female" checked={persona === 'female'} onChange={() => setPersona('female')} /> Female</label>
        <label><input type="radio" name="p" value="male" checked={persona === 'male'} onChange={() => setPersona('male')} /> Male</label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="small">I confirm I am 18 or older <input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)} /></label>
      </div>

      <div style={{ marginTop: 12 }}>
        <input placeholder="One-sentence issue summary (optional)" style={{ width: '100%', padding: 8 }} value={intake} onChange={e => setIntake(e.target.value)} />
      </div>

      <div style={{ marginTop: 12 }}>
        {!sessionId ? <button onClick={startSession}>Start Session</button> : <button className="secondary" onClick={deleteSession}>End & Delete Session</button>}
      </div>

      <div style={{ marginTop: 14 }} className="chat" ref={chatRef}>
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'small'}`}>
            <div style={{ display: 'inline-block', padding: 8, borderRadius: 8, background: m.role === 'user' ? '#e6fffa' : '#f1f5f9' }}>
              <div className="small">{m.role.toUpperCase()}</div>
              <div>{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="controls">
        <input style={{ flex: 1, padding: 8 }} value={input} onChange={e => setInput(e.target.value)} placeholder="Write your message..." />
        <button onClick={sendMessage}>Send</button>
      </div>

      <div style={{ marginTop: 12 }} className="small">This assistant provides general information and is not a replacement for medical or legal advice. If you are in immediate danger, contact local emergency services.</div>
    </div>
  )
}
