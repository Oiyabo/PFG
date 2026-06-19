import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { fetchRandomTeam } from './utils/pokeapi';
import './index.css';

const GRID_SIZE = 10;

function App() {
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState('lobby'); // 'lobby', 'loading', 'playing'
  
  // Game Data
  const [myTeam, setMyTeam] = useState([]);
  const [enemyTeam, setEnemyTeam] = useState([]);
  
  // Grid State: { id: string, x: number, y: number, pokemon: object, owner: 'me' | 'enemy' }
  const [entities, setEntities] = useState([]);
  
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      // Someone connected to us (We are Host)
      setIsHost(true);
      setupConnection(conn);
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
    };
  }, []);

  const setupConnection = (conn) => {
    connRef.current = conn;
    
    conn.on('open', () => {
      setConnected(true);
      setGameState('loading');
      initializeGame(conn);
    });

    conn.on('data', (data) => {
      handleNetworkData(data);
    });

    conn.on('close', () => {
      setConnected(false);
      setGameState('lobby');
      alert('Connection lost!');
    });
  };

  const connectToPeer = () => {
    if (!targetId || targetId === peerId) return;
    setIsHost(false);
    const conn = peerRef.current.connect(targetId);
    setupConnection(conn);
  };

  const initializeGame = async (conn) => {
    // Fetch Pokemon
    const team = await fetchRandomTeam(1); // 1 Pokemon per player for MVP
    setMyTeam(team);
    
    // Send our team to the other player
    conn.send({ type: 'INIT_TEAM', team });
  };

  const handleNetworkData = (data) => {
    if (data.type === 'INIT_TEAM') {
      setEnemyTeam(data.team);
      // If we are host and received enemy team, we generate the starting grid
      if (isHost) {
        generateStartingGrid(myTeam, data.team);
      }
    } else if (data.type === 'SYNC_GRID') {
      setEntities(data.entities);
      setGameState('playing');
    } else if (data.type === 'MOVE') {
      // Handle movement from enemy
      setEntities(data.entities);
    }
  };

  // Generate starting positions
  const generateStartingGrid = (hostTeam, clientTeam) => {
    const newEntities = [];
    
    // Host starts on the left (x = 0)
    hostTeam.forEach((pokemon, index) => {
      newEntities.push({
        id: `host-${index}`,
        x: 0,
        y: Math.floor(GRID_SIZE / 2) + index,
        pokemon: pokemon,
        owner: isHost ? 'me' : 'enemy'
      });
    });

    // Client starts on the right (x = GRID_SIZE - 1)
    clientTeam.forEach((pokemon, index) => {
      newEntities.push({
        id: `client-${index}`,
        x: GRID_SIZE - 1,
        y: Math.floor(GRID_SIZE / 2) + index,
        pokemon: pokemon,
        owner: isHost ? 'enemy' : 'me'
      });
    });

    setEntities(newEntities);
    setGameState('playing');
    
    // Sync to client
    connRef.current.send({ type: 'SYNC_GRID', entities: newEntities });
  };

  const handleCellClick = (x, y) => {
    // MVP: Just teleport the first Pokemon we own to the clicked cell
    if (gameState !== 'playing') return;
    
    const myEntityIndex = entities.findIndex(e => e.owner === 'me');
    if (myEntityIndex === -1) return;

    // Check if cell is occupied
    if (entities.some(e => e.x === x && e.y === y)) return;

    const newEntities = [...entities];
    newEntities[myEntityIndex] = { ...newEntities[myEntityIndex], x, y };
    
    setEntities(newEntities);
    
    // Notify peer
    if (connRef.current) {
      // Invert owner ownership for the other client when sending
      const flippedEntities = newEntities.map(e => ({
        ...e,
        owner: e.owner === 'me' ? 'enemy' : 'me'
      }));
      connRef.current.send({ type: 'MOVE', entities: flippedEntities });
    }
  };

  // Render
  if (gameState === 'lobby') {
    return (
      <div className="glass-panel lobby">
        <h1>Pokémon Roguelike</h1>
        
        <div style={{ width: '100%' }}>
          <p className="status-text">Your ID (Give this to a friend to Host)</p>
          <div className="peer-id-box">{peerId || 'Loading...'}</div>
        </div>
        
        <div style={{ width: '100%', textAlign: 'center', margin: '1rem 0' }}>
          <span className="status-text">--- OR ---</span>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p className="status-text">Join a Friend's Game</p>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Enter Friend's ID..." 
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
          <button className="btn" onClick={connectToPeer}>Connect & Play</button>
        </div>
      </div>
    );
  }

  if (gameState === 'loading') {
    return (
      <div className="glass-panel lobby">
        <h2>Loading Game...</h2>
        <p className="status-text">Fetching wild Pokémon data...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="glass-panel" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h3>Your Team</h3>
          <p className="status-text">{myTeam.map(p => p.name).join(', ')}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3>Enemy Team</h3>
          <p className="status-text">{enemyTeam.map(p => p.name).join(', ')}</p>
        </div>
      </div>

      <div className="arena-container">
        <div className="grid-board">
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
            const x = i % GRID_SIZE;
            const y = Math.floor(i / GRID_SIZE);
            const entityHere = entities.find(e => e.x === x && e.y === y);

            return (
              <div 
                key={i} 
                className="grid-cell"
                onClick={() => handleCellClick(x, y)}
                style={{
                  border: entityHere?.owner === 'me' ? '2px solid var(--accent-green)' : 
                          entityHere?.owner === 'enemy' ? '2px solid var(--accent-red)' : 'none'
                }}
              >
                {entityHere && (
                  <img 
                    src={entityHere.pokemon.sprite} 
                    alt={entityHere.pokemon.name} 
                    className="pokemon-sprite"
                    draggable="false"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
