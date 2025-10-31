# Lexsy

A minimal web application for filling legal document templates through a conversational interface.

## Features

- Upload `.docx` files with placeholders
- AI-powered conversational interface to fill placeholders
- Preserves document formatting
- Dark/light mode toggle

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` with your Groq API key:
```env
GROQ_API_KEY=your_api_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Supported Placeholder Formats

- `[Square Brackets]`
- `{Curly Braces}`
- `{{Double Curly Braces}}`
- `<<Angle Brackets>>`
- `$[__________]` (currency blanks)

## Tech Stack

Next.js 14 · TypeScript · Tailwind CSS · Groq AI

## License

MIT
