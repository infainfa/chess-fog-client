import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useSocket(handlers) {
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // завжди актуальні без ре-підписки

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected:', socket.id);
      handlersRef.current.onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
      handlersRef.current.onDisconnect?.(reason);
    });

    socket.on('waiting',     ()       => handlersRef.current.onWaiting?.());
    socket.on('game_start',  (data)   => handlersRef.current.onGameStart?.(data));
    socket.on('move_made',   (data)   => handlersRef.current.onMoveMade?.(data));
    socket.on('valid_moves', (data)   => handlersRef.current.onValidMoves?.(data));
    socket.on('game_over',   (data)   => handlersRef.current.onGameOver?.(data));
    socket.on('error',       (data)   => handlersRef.current.onError?.(data));

    return () => socket.disconnect();
  }, []); // mount/unmount тільки

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit };
}
