# ♟ Fog of War Chess — Frontend

React + Vite + **chessground** (офіційна бібліотека lichess)

## Структура

```
src/
├── App.jsx                    # Головний компонент, логіка гри
├── App.module.css
├── main.jsx
├── styles/
│   └── global.css             # Імпортує chessground CSS + темна тема
├── components/
│   ├── ChessBoard.jsx         # Обгортка chessground + FogOverlay
│   ├── FogOverlay.jsx         # Div-оверлеї для туманних клітинок
│   ├── PlayerBar.jsx          # Панель гравця (ім'я, рейтинг, індикатор ходу)
│   └── GameOverModal.jsx      # Модалка кінця гри
├── hooks/
│   ├── useSocket.js           # Socket.IO підключення і події
│   └── useChessground.js      # Ініціалізація і контроль chessground
└── lib/
    └── fogEngine.js           # Логіка видимості + конвертація board→pieces
```

## Запуск

```bash
# 1. Встановити залежності
npm install

# 2. Запустити dev сервер
npm run dev
# → http://localhost:5173
```

## Залежності

| Пакет | Призначення |
|-------|-------------|
| `chessground` | Інтерактивна дошка (lichess) |
| `chess.js` | Валідація ходів, FEN, ігрова логіка |
| `socket.io-client` | Real-time з'єднання з бекендом |

## Як працює Fog of War

1. Сервер надсилає `visibleSquares` — масив видимих клітинок
2. `boardToPieces()` прибирає фігури з туманних клітинок перед передачею в chessground
3. `FogOverlay` рендерить `div`-оверлеї поверх дошки для туманних клітинок
4. `buildDests()` прибирає ходи для фігур в тумані

**Hardcore правило**: `check: false` завжди передається в chessground — шах не підсвічується.

## Змінні середовища

```env
# .env.local
VITE_SERVER_URL=http://localhost:3001
```

## Наступні кроки

- [ ] Таймер (chess clock)
- [ ] Звукові ефекти (`move-self.ogg`, `capture.ogg` — з lichess, MIT)
- [ ] Expo клієнт (мобільний)
- [ ] Supabase Realtime замість Socket.IO
- [ ] Рейтинг і профілі
