# lexsy

A minimal web application for filling legal document templates through a conversational interface. Upload your `.docx` files and let AI guide you through filling placeholders naturally.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Overview

Lexsy solves the problem of manually filling legal document templates by providing an AI-powered conversational interface. Simply upload your `.docx` file with placeholders, and Lexsy will guide you through filling each field through natural conversation while preserving your document's formatting.

**Who it's for:** Lawyers, legal professionals, entrepreneurs, and anyone who needs to fill legal document templates efficiently.

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **AI**: Groq SDK (Llama 3.3 70B)
- **Document Processing**: Mammoth (Word to HTML), docx (Word generation), Pizzip
- **File Handling**: File-saver
- **Deployment**: Vercel-ready

## Features

- **AI-Powered Conversation**: Natural language interface powered by Groq AI
- **Multiple Placeholder Formats**: Supports `[Square Brackets]`, `{Curly Braces}`, `{{Double Curly Braces}}`, `<<Angle Brackets>>`, and `$[__________]` (currency blanks)
- **Format Preservation**: Maintains original document formatting and structure
- **Smart Value Extraction**: Automatically formats currency values and dates
- **Dark/Light Mode**: Toggle between themes for comfortable viewing
- **Real-time Preview**: See your filled document as you complete each field
- **Export Ready**: Download completed documents in `.docx` format

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/marvellousz/lexsy.git
   cd lexsy
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create `.env.local` with:

   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Run the application**

   ```bash
   npm run dev
   ```

Visit `http://localhost:3000` to use the application.

## Usage

### Uploading a Document

1. **Upload your `.docx` file** by dragging and dropping or clicking to browse
2. **Lexsy automatically detects** all placeholders in your document
3. **Supported placeholder formats**:
   - `[Square Brackets]`
   - `{Curly Braces}`
   - `{{Double Curly Braces}}`
   - `<<Angle Brackets>>`
   - `$[__________]` (currency blanks)

### Filling Placeholders

1. **Start the conversation** - Lexsy will ask about the first placeholder
2. **Answer naturally** - Respond to AI prompts in plain language
3. **Automatic formatting** - Currency values (e.g., "100k" → "$100,000") and dates are formatted automatically
4. **Review as you go** - See your document update in real-time
5. **Download when complete** - Export your filled document

### Example Conversation

- **AI**: "What is the purchase amount?"
- **You**: "100 thousand dollars"
- **AI**: "Got it, I've set the purchase amount to $100,000. What is the valuation cap?"
- **You**: "5 million"
- **AI**: "Perfect, I've set the valuation cap to $5,000,000..."

## Deployment

### Vercel (Recommended)

1. **Connect your GitHub repository** to Vercel
2. **Add environment variables** in Vercel dashboard:

   - `GROQ_API_KEY`: Your Groq API key

3. **Deploy** - Vercel handles the build automatically

### Manual Deployment

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Environment Variables for Production

Ensure all environment variables are set in your deployment platform:

- `GROQ_API_KEY` (Your Groq API key from https://console.groq.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

- **Email**: pranavmurali024@gmail.com
- **GitHub**: [https://github.com/marvellousz/lexsy](https://github.com/marvellousz/lexsy)

---

Built with ❤️ for legal professionals
