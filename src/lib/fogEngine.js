const FILES = ['a','b','c','d','e','f','g','h'];

function rcToSq(f, r) { return `${FILES[f]}${8 - r}`; }
function inBounds(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

export function getVisibleSquares(board, color) {
  const visible = new Set();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece || piece.color !== color) continue;
      visible.add(rcToSq(file, rank));
      getAttacks(board, file, rank, piece, color).forEach(sq => visible.add(sq));
    }
  }
  return visible;
}

function getAttacks(board, file, rank, piece, color) {
  const opp = color === 'w' ? 'b' : 'w';

  const slide = (dirs) => {
    const sqs = [];
    for (const [df,dr] of dirs) {
      let f = file+df, r = rank+dr;
      while (inBounds(f, r)) {
        sqs.push(rcToSq(f, r));
        if (board[r]?.[f]) break;
        f+=df; r+=dr;
      }
    }
    return sqs;
  };

  switch (piece.type) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? 6 : 1;
      const front = rank + dir;
      const sqs = [];

      // Вперед: тільки якщо вільна
      if (inBounds(file, front) && !board[front]?.[file]) {
        sqs.push(rcToSq(file, front));
        const front2 = rank + 2 * dir;
        if (rank === startRank && inBounds(file, front2) && !board[front2]?.[file]) {
          sqs.push(rcToSq(file, front2));
        }
      }

      // Діагоналі: тільки якщо там ворожа фігура
      for (const df of [-1, 1]) {
        if (inBounds(file+df, front)) {
          const target = board[front]?.[file+df];
          if (target && target.color === opp) sqs.push(rcToSq(file+df, front));
        }
      }
      return sqs;
    }
    case 'n':
      return [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]
        .filter(([df,dr]) => inBounds(file+df, rank+dr))
        .map(([df,dr]) => rcToSq(file+df, rank+dr));
    case 'b': return slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
    case 'r': return slide([[1,0],[-1,0],[0,1],[0,-1]]);
    case 'q': return slide([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
    case 'k':
      return [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
        .filter(([df,dr]) => inBounds(file+df, rank+dr))
        .map(([df,dr]) => rcToSq(file+df, rank+dr));
    default: return [];
  }
}

export function boardToPieces(board, visibleSquares) {
  const pieces = new Map();
  const ROLES = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;
      const sq = rcToSq(file, rank);
      if (visibleSquares && !visibleSquares.has(sq)) continue;
      pieces.set(sq, {
        role:  ROLES[piece.type],
        color: piece.color === 'w' ? 'white' : 'black',
      });
    }
  }
  return pieces;
}
