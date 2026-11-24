# Баги

- [чужое, открыто у live-load-cpu] AppMapCanvas.tsx:207 onMoveEnd трогает window после снятия DOM в canvas.test → падает тест, идущий следом. Незакоммиченная правка другого агента, не мой путь.
