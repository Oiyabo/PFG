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
  
  // Grid State
  const [entities, setEntities] = useState([]);
  
  // Refs for callbacks
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const isHostRef = useRef(false);
  const myTeamRef = useRef([]);
  const enemyTeamRef = useRef([]);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      // Someone connected to us (We are Host)
      setIsHost(true);
      isHostRef.current = true;
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
    isHostRef.current = false;
    const conn = peerRef.current.connect(targetId);
    setupConnection(conn);
  };

  const initializeGame = async (conn) => {
    // Fetch Pokemon
    const team = await fetchRandomTeam(1); // 1 Pokemon per player for MVP
    setMyTeam(team);
    myTeamRef.current = team;
    
    // Send our team to the other player
    conn.send({ type: 'INIT_TEAM', team });

    // Check if we already received the enemy team
    checkAndStartGrid(conn);
  };

  const handleNetworkData = (data) => {
    if (data.type === 'INIT_TEAM') {
      setEnemyTeam(data.team);
      enemyTeamRef.current = data.team;
      checkAndStartGrid(connRef.current);
    } else if (data.type === 'SYNC_GRID') {
      setEntities(data.entities);
      setGameState('playing');
    } else if (data.type === 'MOVE') {
      setEntities(data.entities);
    }
  };

  const checkAndStartGrid = (conn) => {
    // Only host generates grid when both teams are ready
    if (isHostRef.current) {
      if (myTeamRef.current.length > 0 && enemyTeamRef.current.length > 0) {
        generateStartingGrid(myTeamRef.current, enemyTeamRef.current, conn);
      }
    }
  };

  // Generate starting positions
  const generateStartingGrid = (hostTeam, clientTeam, conn) => {
    const newEntities = [];
    
    // Host starts on the left (x = 0)
    hostTeam.forEach((pokemon, index) => {
      newEntities.push({
        id: `host-${index}`,
        x: 0,
        y: Math.floor(GRID_SIZE / 2) + index,
        pokemon: pokemon,
        owner: 'me'
      });
    });

    // Client starts on the right (x = GRID_SIZE - 1)
    clientTeam.forEach((pokemon, index) => {
      newEntities.push({
        id: `client-${index}`,
        x: GRID_SIZE - 1,
        y: Math.floor(GRID_SIZE / 2) + index,
        pokemon: pokemon,
        owner: 'enemy'
      });
    });

    setEntities(newEntities);
    setGameState('playing');
    
    // Sync to client
    const flippedEntities = newEntities.map(e => ({
      ...e,
      owner: e.owner === 'me' ? 'enemy' : 'me'
    }));
    conn.send({ type: 'SYNC_GRID', entities: flippedEntities });
  };

  const handleCellClick = (x, y) => {
    if (gameState !== 'playing') return;
    
    const myEntityIndex = entities.findIndex(e => e.owner === 'me');
    if (myEntityIndex === -1) return;

    // Check if cell is occupied
    if (entities.some(e => e.x === x && e.y === y)) return;

    const newEntities = [...entities];
    newEntities[myEntityIndex] = { ...newEntities[myEntityIndex], x, y };
    
    setEntities(newEntities);
    
    if (connRef.current) {
      const flippedEntities = newEntities.map(e => ({
        ...e,
        owner: e.owner === 'me' ? 'enemy' : 'me'
      }));
      connRef.current.send({ type: 'MOVE', entities: flippedEntities });
    }
  };

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
