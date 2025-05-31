# Planet Beauty AI Shopping Assistant

A Shopify template app that lets you embed an AI-powered chat widget on your storefront. Shoppers can discover beauty products, get personalized recommendations, explore makeup tutorials, receive skincare advice, and complete purchases - all without leaving the conversation. Under the hood it speaks the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) to tap into Shopify’s APIs.

### Overview
- **What it is**: A chat widget + backend that turns your beauty storefront into an AI shopping assistant.
- **Key features**:
  - Natural-language beauty product discovery
  - Personalized product recommendations
  - Access to makeup tutorials and skincare advice
  - Store policy & FAQ lookup
  - Create carts, add or remove items, and initiate checkout
  - Track orders and initiate returns

## Developer Docs
- Everything from installation to deep dives lives on https://shopify.dev/docs/apps/build/storefront-mcp.
- Clone this repo and follow the instructions on the dev docs.

## Examples
- "Hi there! What are you looking for today?"
- "Can you help me find a cruelty-free red lipstick?"
- "What are the ingredients in the 'Celestial Glow' serum?"
- "Show me makeup tutorials for a smokey eye look."
- "What skincare routine do you recommend for oily skin?"
- "Add the 'Velvet Orchid' foundation to my cart."
- "Show me my recent orders."
- `can you tell me what is in my cart` > will use the `get_cart` MCP tool.
- `what languages is your store available in?` > will use the `search_shop_policies_and_faqs` MCP tool.
- `I'd like to checkout` > will call checkout from one of the above MCP cart tools.
- `Can you give me more details about order Id 1` > will use the `get_order_status` MCP tool.

## Architecture

### Components
This app consists of two main components:

1. **Backend**: A Remix app server that handles communication with Claude, processes chat messages, and acts as an MCP Client.
2. **Chat UI**: A Shopify theme extension that provides the customer-facing chat interface.

When you start the app, it will:
- Start Remix in development mode.
- Tunnel your local server so Shopify can reach it.
- Provide a preview URL to install the app on your development store.

For direct testing, point your test suite at the `/chat` endpoint (GET or POST for streaming).

### MCP Tools Integration
- The backend already initializes all Shopify MCP tools—see [`app/mcp-client.js`](./app/mcp-client.js).
- These tools let your LLM invoke product search, cart actions, order lookups, etc.
- More in our [dev docs](https://shopify.dev/docs/apps/build/storefront-mcp).

### Tech Stack
- **Framework**: [Remix](https://remix.run/)
- **AI**: [Claude by Anthropic](https://www.anthropic.com/claude)
- **Shopify Integration**: [@shopify/shopify-app-remix](https://www.npmjs.com/package/@shopify/shopify-app-remix)
- **Database**: SQLite (via Prisma) for session storage

## Customizations
This repo can be customized. You can:
- Edit the prompt
- Change the chat widget UI
- Swap out the LLM

You can learn how from our [dev docs](https://shopify.dev/docs/apps/build/storefront-mcp).

## Deployment
Follow standard Shopify app deployment procedures as outlined in the [Shopify documentation](https://shopify.dev/docs/apps/deployment/web).

## Contributing
We appreciate your interest in contributing to this project. As this is an example repository intended for educational and reference purposes, we are not accepting contributions.
