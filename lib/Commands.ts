import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { Links } from '../enums/Links';
import { RemindApp } from '../RemindApp';
import { sendUserNotification } from './Notification';
import { Language, t } from './Translation/translation';

class CommandsClass {
	async processHelpCommand({
		app,
		read,
		modify,
		room,
		user,
		language,
	}: {
		app: RemindApp;
		read: IRead;
		modify: IModify;
		room: IRoom;
		user: IUser;
		language: Language;
	}) {
		const block = modify.getCreator().getBlockBuilder();

		const firstName = user.name ? user.name.split(' ')[0] : '';
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t('help_command_greeting_message', language, {
					name: firstName,
				}),
			),
		});

		block.addDividerBlock();

		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t('help_command_basic_usage', language),
			),
		});

		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t('help_command_message_reminder_usage', language),
			),
		});

		block.addDividerBlock();

		block.addSectionBlock({
			text: block.newMarkdownTextObject(t('control_shortcuts', language)),
		});
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('create_a_reminder', language),
					),
					actionId: 'create-reminder',
				}),
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('view_all_reminders', language),
					),
					actionId: 'view-all-reminders',
				}),
			],
		});

		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('configure_your_preferences', language),
					),
					actionId: 'configure-your-preferences',
				}),
			],
		});

		block.addDividerBlock();

		block.addSectionBlock({
			text: block.newMarkdownTextObject(t('need_more', language)),
		});
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(t('more_help', language)),
					url: Links.DocumentationLink,
				}),
				block.newButtonElement({
					text: block.newPlainTextObject(t('contact_us', language)),
					url: Links.ContactUsPageUrl,
				}),
			],
		});

		await sendUserNotification(
			app,
			read,
			modify,
			room,
			user,
			undefined,
			undefined,
			block,
		);
	}
}

export const Commands = new CommandsClass();
