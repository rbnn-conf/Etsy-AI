const DIRECTIONS = [[1,0],[0,1],[1,1],[-1,1],[-1,0],[0,-1],[-1,-1],[1,-1]];
function rng(seed) {let x=seed>>>0;return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
export function allOccurrences(grid, word) {
  const n=grid.length, hits=[];
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) for(const [dx,dy] of DIRECTIONS) {
    const cells=Array.from(word,(_,i)=>[x+dx*i,y+dy*i]);
    if(cells.every(([cx,cy],i)=>cx>=0&&cy>=0&&cx<n&&cy<n&&grid[cy][cx]===word[i])) hits.push(cells);
  }
  return hits;
}
export function blockedHits(grid, blocked) {
  return blocked.flatMap(word=>allOccurrences(grid,word).map(cells=>({word,cells})));
}
export function generatePuzzle(spec, blocked) {
  if(new Set(spec.words).size!==spec.words.length||spec.words.some(w=>!/^[A-Z]+$/.test(w)||w.length>spec.size)) throw new Error('Invalid word list');
  for(let attempt=0;attempt<1000;attempt++) {
    const random=rng(spec.seed+attempt), n=spec.size;
    const grid=Array.from({length:n},()=>Array(n).fill(''));
    const solutions=[];let failed=false;
    for(const word of [...spec.words].sort((a,b)=>b.length-a.length)) {
      const choices=[];
      for(let y=0;y<n;y++) for(let x=0;x<n;x++) for(const [dx,dy] of DIRECTIONS) {
        const cells=Array.from(word,(_,i)=>[x+dx*i,y+dy*i]);
        if(cells.every(([cx,cy],i)=>cx>=0&&cy>=0&&cx<n&&cy<n&&(!grid[cy][cx]||grid[cy][cx]===word[i]))) choices.push(cells);
      }
      if(!choices.length){failed=true;break;}
      const cells=choices[Math.floor(random()*choices.length)];
      cells.forEach(([x,y],i)=>grid[y][x]=word[i]);solutions.push({word,cells});
    }
    if(failed)continue;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!grid[y][x])grid[y][x]='ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(random()*26)];
    if(blockedHits(grid,blocked).length)continue;
    if(spec.words.some(w=>allOccurrences(grid,w).length!==1))continue;
    return {grid,solutions,seed:spec.seed+attempt,attempts:attempt+1};
  }
  throw new Error('No unique screened puzzle found');
}
export function verifyPuzzle(puzzle, words, blocked) {
  if(puzzle.solutions.length!==words.length)throw new Error('Answer count mismatch');
  for(const word of words) {
    const solution=puzzle.solutions.find(s=>s.word===word);
    if(!solution||solution.cells.map(([x,y])=>puzzle.grid[y]?.[x]).join('')!==word||allOccurrences(puzzle.grid,word).length!==1)throw new Error(`Incorrect solution: ${word}`);
  }
  if(blockedHits(puzzle.grid,blocked).length)throw new Error('Blocked string in puzzle');
  return {words:words.length,uniqueOccurrences:true,allCoordinatesCorrect:true,screened:true};
}
