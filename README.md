# Reminder Bot for Rocket.Chat

An open-source reminder app for Rocket.Chat that helps you and your team stay organized by creating reminders directly within your chat.

## Features

-   ⏰ Create personal reminders with natural language or via UI
-   👥 Set reminders for other users or channels
-   🔁 Recurring reminders (daily, weekly, monthly, custom intervals)
-   📝 Message-based reminders - remind yourself about specific messages
-   🌍 Multi-language support (English, German, Polish, Portuguese, Russian)
-   📅 Customizable time formats (12h/24h)
-   💾 Automated backup and restore functionality
-   🔔 Daily reminder summaries

## Installation

### From Marketplace

1. Go to your Rocket.Chat Administration → Apps → Marketplace
2. Search for "Reminder Bot"
3. Click Install

### Manual Installation

1. Download the latest `.zip` file from the releases
2. Go to Administration → Apps → Upload App
3. Select the downloaded file and click Install

## Usage

### Basic Commands

-   `/remind` - Opens the reminder creation dialog
-   `/remind list` - View all your reminders
-   `/remind help` - Show help and available commands

### Quick Examples

-   `/remind me to review PR tomorrow at 9am`
-   `/remind @john to submit report next Monday`
-   `/remind #general about team meeting every Friday at 3pm`

## Documentation

For detailed guides on installation, setting up reminders, managing reminders, and more, visit our [documentation repository](https://github.com/AddReminders/reminder-docs).

## Development

### Prerequisites

-   Node.js (v20 or higher)
-   npm or yarn
-   Rocket.Chat server (v4.3.1 or higher)
-   [@rocket.chat/apps-cli](https://www.npmjs.com/package/@rocket.chat/apps-cli)

### Setup

```bash
# Install dependencies
npm install

# Build the app
npm run typecheck

# Package the app
rc-apps package

# Deploy to your server
rc-apps deploy
```

### Project Structure

-   `command/` - Slash command handlers
-   `handlers/` - UI interaction handlers
-   `jobs/` - Scheduled job processors
-   `ui/` - Modal and block definitions
-   `lib/` - Core business logic

## Compatibility

| App Version | Apps-Engine | Rocket.Chat Server |
| ----------- | ----------- | ------------------ |
| 1.x.x       | 1.20.0+     | 3.9.0+             |
| 2.x.x       | 1.29.1+     | 4.3.1+             |

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Icon credit

<!-- <a href="https://www.flaticon.com/free-icons/reminder" title="reminder icons">Reminder icons created by Freepik - Flaticon</a> -->

<a href="https://www.flaticon.com/free-icons/flexibility" title="flexibility icons">Flexibility icons created by kerismaker - Flaticon</a>
AppsForChat - Chat icon
<a href="https://www.flaticon.com/free-icons/message" title="message icons">Message icons created by SBTS2018 - Flaticon</a>
