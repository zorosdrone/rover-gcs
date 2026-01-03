import { useState } from 'react'
import ClassicMode from './ClassicMode'
import AdvancedMode from './AdvancedMode'
import './App.css'

function App() {
  const [mode, setMode] = useState(null) // null: 選択画面, 'classic', 'advanced'
  const [transmitInterval, setTransmitInterval] = useState(1000) // TX Interval (ms) - Shared state
  const [viewId, setViewId] = useState("43wygAK") // VDO.ninja View ID

  if (!mode) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh', 
        backgroundColor: '#282c34', 
        color: 'white' 
      }}>
        <h1>Rover GCS</h1>
        <p>Select Operation Mode</p>
        
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label htmlFor="viewId" style={{ marginBottom: '5px' }}>VDO.ninja View ID:</label>
          <input 
            id="viewId"
            type="text" 
            value={viewId} 
            onChange={(e) => setViewId(e.target.value)}
            style={{ 
              padding: '8px', 
              borderRadius: '4px', 
              border: '1px solid #ccc',
              fontSize: '1rem',
              textAlign: 'center'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          <button 
            onClick={() => setMode('classic')}
            style={{ 
              padding: '20px', 
              fontSize: '1.2rem', 
              cursor: 'pointer',
              backgroundColor: '#61dafb',
              border: 'none',
              borderRadius: '8px',
              color: '#282c34',
              fontWeight: 'bold'
            }}
          >
            Classic Mode
            <div style={{ fontSize: '0.8rem', marginTop: '5px', fontWeight: 'normal' }}>Stable Version</div>
          </button>
          <button 
            onClick={() => setMode('advanced')}
            style={{ 
              padding: '20px', 
              fontSize: '1.2rem', 
              cursor: 'pointer',
              backgroundColor: '#ff6b6b',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            Advanced Mode
            <div style={{ fontSize: '0.8rem', marginTop: '5px', fontWeight: 'normal' }}>New Features</div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {mode === 'classic' ? (
        <ClassicMode 
          onSwitchMode={() => setMode('advanced')} 
          transmitInterval={transmitInterval}
          setTransmitInterval={setTransmitInterval}
        />
      ) : (
        <AdvancedMode 
          onSwitchMode={() => setMode('classic')} 
          transmitInterval={transmitInterval}
          setTransmitInterval={setTransmitInterval}
          viewId={viewId}
          setViewId={setViewId}
        />
      )}
    </>
  )
}

export default App
