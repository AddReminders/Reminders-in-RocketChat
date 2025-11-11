export enum Links {
	GitHubRepo = 'https://github.com/AddReminders/Reminders-in-RocketChat',
	ContactUsPageUrl = 'https://github.com/AddReminders/Reminders-in-RocketChat/issues',
	DocumentationLink = 'https://github.com/AddReminders/Reminders-in-RocketChat#readme',
	RestoreBackupGuideLink = 'https://github.com/AddReminders/Reminders-in-RocketChat#readme',
	BackupGuideLink = 'https://github.com/AddReminders/Reminders-in-RocketChat#readme',
	SettingUpReminderGuideLink = 'https://github.com/AddReminders/Reminders-in-RocketChat#usage',
	LanguageGuideLink = 'https://github.com/AddReminders/Reminders-in-RocketChat#readme',
}

// Unfortunately, due to a weird circular dependency issue, I have to put this here instead of in enums/Messages.ts
export const WELCOME_MESSAGE = `Your Reminder Bot app is now installed and ready to use 🎉

To get started:
- Try creating a new reminder by following the [usage guide](${Links.SettingUpReminderGuideLink})
- Want to use Reminder Bot in another language? Check out the [documentation](${Links.LanguageGuideLink})
- Learn about [backup and restore](${Links.BackupGuideLink}) to protect your reminder data

✨ **All features are included:**
- Unlimited reminders
- Reminders for channels and users
- Recurring reminders (daily, weekly, monthly, custom)
- Multi-language support
- Customizable time formats

We hope you enjoy using Reminder Bot!

💡 Need help or want to contribute? Visit our [GitHub repository](${Links.GitHubRepo}) or [report issues](${Links.ContactUsPageUrl}).`;
