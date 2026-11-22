# Decisions

- DOM в unit — happy-dom на время файла, а не preload на весь прогон: тесты шлюза и middleware используют настоящий fetch и сокеты, а happy-dom подменяет fetch.
- `screen` из Testing Library не используется: он привязывается к document первого импорта; вместо него — within(container).
