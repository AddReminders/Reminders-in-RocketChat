import {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	ISlashCommand,
	SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';
import { IPreference } from '../definitions/Persistence';
import { ReminderRecipientsType } from '../enums/Ui';
import { Commands } from '../lib/Commands';
import { BackupMessages } from '../lib/Messages/BackupMessages';
import { sendUserNotification } from '../lib/Notification';
import { Language, t } from '../lib/Translation/translation';
import { getUserPreference } from '../lib/UserPreference';
import { RemindApp } from '../RemindApp';
import { dialogModal } from '../ui/modals/DialogModal';
import { createTaskCreationModal } from '../ui/modals/TaskCreateModal/Modal';
import { createReminderListModal } from '../ui/modals/TaskResultModal/Modal';
import { DSTMovement } from '../enums/DST';
import { DST } from '../lib/DST';

export class RemindCommand implements ISlashCommand {
	public command = 'remind';
	public i18nParamsExample = 'remind_command_params';
	public i18nDescription = 'remind_command_description';
	public providesPreview = false;

	constructor(private readonly app: RemindApp) {}

	public async executor(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		_http: IHttp,
		persistence: IPersistence,
	): Promise<void> {
		const [command] = context.getArguments();

		const { id: userId } = context.getSender();

		const userPreference = await getUserPreference(
			this.app,
			read.getPersistenceReader(),
			userId,
		);

		const { language } = userPreference;

		switch (command) {
			case 'list':
			case 'listar':
			case 'liste':
			case 'lista': {
				await this.processListRemindersCommand(
					context,
					read,
					modify,
					persistence,
					userPreference,
				);
				break;
			}
			case 'help':
			case 'ajuda':
			case 'helfen':
			case 'pomoc': {
				await this.processHelpCommand(context, read, modify, language);
				break;
			}
			case 'backup': {
				await this.processBackupCommand(
					context,
					read,
					modify,
					language,
				);
				break;
			}
			case 'dst': {
				await this.processDSTCommand(
					context,
					read,
					persistence,
					modify,
					language,
				);
				break;
			}
			case undefined: {
				await this.processDefaultCommand(
					context,
					read,
					modify,
					language,
				);
				break;
			}
			default: {
				await this.processCreateReminderCommand(
					context,
					read,
					modify,
					persistence,
					userPreference,
				);
				break;
			}
		}
	}

	private async processDSTCommand(
		context: SlashCommandContext,
		read: IRead,
		persis: IPersistence,
		modify: IModify,
		language: Language,
	) {
		const room = context.getRoom();
		const user = context.getSender();

		const [, forwardOrBackward] = context.getArguments();

		const { roles } = user;

		if (!roles.includes('admin')) {
			this.app.getLogger().error('Error: User is not admin');
			await sendUserNotification(
				this.app,
				read,
				modify,
				room,
				user,
				t('cannot_run_command_since_not_admin', language),
			);
			return;
		}

		if (
			![DSTMovement.FORWARD, DSTMovement.BACKWARD].includes(
				forwardOrBackward as unknown as DSTMovement,
			)
		) {
			await sendUserNotification(
				this.app,
				read,
				modify,
				room,
				user,
				'Invalid argument. Please use `forward` or `backward`. Example: `/remind dst forward` to move all reminders forward by 1 hour.',
			);
			return;
		}

		try {
			await DST.applyDSTToReminders({
				movement: forwardOrBackward as unknown as DSTMovement,
				app: this.app,
				modify,
				persis,
				read,
			});

			await sendUserNotification(
				this.app,
				read,
				modify,
				room,
				user,
				`All active reminders have been moved ${forwardOrBackward} by 1 hour`,
			);
		} catch (error) {
			this.app.getLogger().error(error);
			await sendUserNotification(
				this.app,
				read,
				modify,
				room,
				user,
				`Error: Something went wrong. Please check the logs.\nDetails: ${error.message}`,
			);
		}
	}

	private async processBackupCommand(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		language: Language,
	) {
		const room = context.getRoom();
		const user = context.getSender();

		const { roles } = user;

		if (!roles.includes('admin')) {
			this.app.getLogger().error('Error: User is not admin');
			await sendUserNotification(
				this.app,
				read,
				modify,
				room,
				user,
				t('cannot_run_command_since_not_admin', language),
			);
			return;
		}

		await BackupMessages.sendManualBackupActionMessage({
			app: this.app,
			read,
			modify,
			room,
			user,
			language,
		});
	}

	private async processDefaultCommand(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		language: Language,
	): Promise<void> {
		// send a message to user with various CTA buttons
		// this is a short help message

		const block = modify.getCreator().getBlockBuilder();

		const sender = context.getSender();
		const room = context.getRoom();

		const firstName = sender.name ? sender.name.split(' ')[0] : '';
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t('default_command_greeting', language, {
					name: firstName,
				}),
			),
		});

		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('create_reminder', language),
					),
					actionId: 'create-reminder',
					style: ButtonStyle.PRIMARY,
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
				block.newButtonElement({
					text: block.newPlainTextObject(t('need_more', language)),
					actionId: 'help-command',
				}),
			],
		});

		await sendUserNotification(
			this.app,
			read,
			modify,
			room,
			sender,
			undefined,
			undefined,
			block,
		);
	}

	private async processHelpCommand(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		language: Language,
	): Promise<void> {
		const room = context.getRoom();
		const sender = context.getSender();

		await Commands.processHelpCommand({
			app: this.app,
			read,
			modify,
			room,
			user: sender,
			language,
		});
	}

	private async processCreateReminderCommand(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		persistence: IPersistence,
		userPreference: IPreference,
	): Promise<void> {
		const triggerId = context.getTriggerId();
		if (!triggerId) {
			throw new Error('Trigger ID is required');
		}

		const { language } = userPreference;

		const cmdArgs = context.getArguments();

		// /remind [me|@user|#channel][0...n] [task]

		if (cmdArgs.length === 0) {
			const modal = await createTaskCreationModal({
				modify,
				read,
				persistence,
				roomId: context.getRoom().id,
				userId: context.getSender().id,
				userPreference,
			});

			return modify
				.getUiController()
				.openModalView(modal, { triggerId }, context.getSender());
		}

		const fullCommand = cmdArgs.join(' ');
		const firstWho = cmdArgs[0];

		let what = '';

		if (
			firstWho === 'me' ||
			firstWho.startsWith('@') ||
			firstWho.startsWith('#')
		) {
			const targetAudience: string[] = [];
			if (firstWho === 'me') {
				what = cmdArgs.slice(1).join(' ');

				const modal = await createTaskCreationModal({
					modify,
					persistence,
					read,
					roomId: context.getRoom().id,
					userId: context.getSender().id,
					initialDescription: what,
					userPreference,
				});

				return modify
					.getUiController()
					.openModalView(modal, { triggerId }, context.getSender());
			} else if (firstWho.startsWith('@')) {
				targetAudience.push(firstWho.substring(1));
				if (cmdArgs.length > 1) {
					const secondWho = cmdArgs[1];
					if (!secondWho.startsWith('@')) {
						// its a reminder text
						what = cmdArgs.slice(1).join(' ');
					} else {
						// multiple users to be reminded
						let i = 1;
						for (; i < cmdArgs.length; i++) {
							if (cmdArgs[i].startsWith('@')) {
								targetAudience.push(cmdArgs[i].substring(1));
							} else {
								break;
							}
						}
						what = cmdArgs.slice(i).join(' ');
					}
				}

				// verify if all the users exist
				for (const username of targetAudience) {
					const user = await read
						.getUserReader()
						.getByUsername(username);
					if (!user) {
						const modal = dialogModal({
							title: 'Error',
							text: t('user_with_username_not_found', language, {
								username,
							}),
							modify,
							language,
						});

						return modify
							.getUiController()
							.openModalView(
								modal,
								{ triggerId },
								context.getSender(),
							);
					}
				}

				const modal = await createTaskCreationModal({
					modify,
					persistence,
					read,
					roomId: context.getRoom().id,
					userId: context.getSender().id,
					initialTargetAudience: targetAudience
						.map((username) => `@${username}`)
						.join(','),
					recipientType: ReminderRecipientsType.USER,
					moreOptionsVisible: true,
					initialDescription: what,
					userPreference,
				});

				return modify
					.getUiController()
					.openModalView(modal, { triggerId }, context.getSender());
			} else if (firstWho.startsWith('#')) {
				targetAudience.push(firstWho.substring(1));
				if (cmdArgs.length > 1) {
					const secondWho = cmdArgs[1];
					if (!secondWho.startsWith('#')) {
						// its a reminder text
						what = cmdArgs.slice(1).join(' ');
					} else {
						// multiple users to be reminded
						let i = 1;
						for (; i < cmdArgs.length; i++) {
							if (cmdArgs[i].startsWith('#')) {
								targetAudience.push(cmdArgs[i].substring(1));
							} else {
								break;
							}
						}
						what = cmdArgs.slice(i).join(' ');
					}
				}

				// verify if all the rooms exist
				for (const roomName of targetAudience) {
					const targetRoom = await read
						.getRoomReader()
						.getByName(roomName);
					if (!targetRoom) {
						const modal = dialogModal({
							title: 'Error',
							text: t('room_with_name_not_found', language, {
								roomName,
							}),
							modify,
							language,
						});

						return modify
							.getUiController()
							.openModalView(
								modal,
								{ triggerId },
								context.getSender(),
							);
					}
				}

				const modal = await createTaskCreationModal({
					modify,
					persistence,
					read,
					roomId: context.getRoom().id,
					userId: context.getSender().id,
					initialTargetAudience: targetAudience
						.map((name) => `#${name}`)
						.join(','),
					recipientType: ReminderRecipientsType.CHANNEL,
					moreOptionsVisible: true,
					initialDescription: what,
					userPreference,
				});

				return modify
					.getUiController()
					.openModalView(modal, { triggerId }, context.getSender());
			}
		} else {
			what = fullCommand;
			const modal = await createTaskCreationModal({
				modify,
				persistence,
				read,
				roomId: context.getRoom().id,
				userId: context.getSender().id,
				initialDescription: what,
				userPreference,
			});

			return modify
				.getUiController()
				.openModalView(modal, { triggerId }, context.getSender());
		}
	}

	private async processListRemindersCommand(
		context: SlashCommandContext,
		read: IRead,
		modify: IModify,
		persistence: IPersistence,
		userPreference: IPreference,
	): Promise<void> {
		const triggerId = context.getTriggerId();
		if (!triggerId) {
			throw new Error('Trigger ID is required');
		}

		const modal = await createReminderListModal({
			app: this.app,
			modify,
			read,
			user: context.getSender(),
			showCompleted: false,
			userPreference,
			logger: this.app.getLogger(),
			persistence,
		});

		await modify
			.getUiController()
			.openModalView(modal, { triggerId }, context.getSender());
	}
}
