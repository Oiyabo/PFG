import axios from 'axios';

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2';

/**
 * Fetch data untuk satu Pokemon berdasarkan ID atau Nama
 */
export const fetchPokemonData = async (idOrName) => {
  try {
    const response = await axios.get(`${POKEAPI_BASE_URL}/pokemon/${idOrName}`);
    const data = response.data;
    
    return {
      id: data.id,
      name: data.name,
      sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
      hp: data.stats.find(s => s.stat.name === 'hp').base_stat,
      attack: data.stats.find(s => s.stat.name === 'attack').base_stat,
      defense: data.stats.find(s => s.stat.name === 'defense').base_stat,
      speed: data.stats.find(s => s.stat.name === 'speed').base_stat,
      types: data.types.map(t => t.type.name),
    };
  } catch (error) {
    console.error(`Error fetching pokemon ${idOrName}:`, error);
    return null;
  }
};

/**
 * Fetch beberapa Pokemon acak untuk roster awal
 */
export const fetchRandomTeam = async (count = 3) => {
  const team = [];
  for (let i = 0; i < count; i++) {
    // Generate random ID between 1 and 151 (Gen 1)
    const randomId = Math.floor(Math.random() * 151) + 1;
    const pokemon = await fetchPokemonData(randomId);
    if (pokemon) {
      team.push(pokemon);
    }
  }
  return team;
};
