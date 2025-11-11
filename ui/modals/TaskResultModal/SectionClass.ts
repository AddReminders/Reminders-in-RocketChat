import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IBlock, ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';
import { IReminder } from '../../../definitions/IReminder';
import { Language, t } from '../../../lib/Translation/translation';

type SectionName = 'upcoming' | 'past' | 'recurring' | 'completed';
abstract class GenericReminderBlockSection {
	private name: SectionName;
	protected modify: IModify;

	constructor(name: SectionName, modify: IModify) {
		this.name = name;
		this.modify = modify;
	}

	abstract getSectionHeaderBlocks(...args: unknown[]): IBlock[];

	getSectionFooterBlocks(): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addDividerBlock();
		return block.getBlocks();
	}
}

export class UpcomingReminderBlockSection extends GenericReminderBlockSection {
	constructor(modify: IModify) {
		super('upcoming', modify);
	}

	getSectionHeaderBlocks(language: Language): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				`**${t('upcoming_reminders', language)}:**`,
			),
		});
		return block.getBlocks();
	}
}

export class PastReminderBlockSection extends GenericReminderBlockSection {
	constructor(modify: IModify) {
		super('past', modify);
	}

	getSectionHeaderBlocks({
		language,
		viewId,
		pastReminders,
	}: {
		language: Language;
		viewId: string;
		pastReminders: IReminder[];
	}): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				`**${t('past_and_incomplete', language)}:**`,
			),
			accessory: block.newButtonElement({
				text: block.newPlainTextObject(
					t('delete_all_past_reminders', language),
				),
				style: ButtonStyle.DANGER,
				actionId: `delete-all-past-reminders_${viewId}`,
				value: pastReminders.map(({ id }) => id).join(','),
			}),
		});
		return block.getBlocks();
	}
}

export class RecurringReminderBlockSection extends GenericReminderBlockSection {
	constructor(modify: IModify) {
		super('recurring', modify);
	}

	getSectionHeaderBlocks(language: Language): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				`**${t('recurring_reminders', language)}:**`,
			),
		});
		return block.getBlocks();
	}
}

export class CompletedReminderBlockSection extends GenericReminderBlockSection {
	constructor(modify: IModify) {
		super('completed', modify);
	}

	getSectionHeaderBlocks({
		language,
		viewId,
		completedReminders,
	}: {
		language: Language;
		viewId: string;
		completedReminders: IReminder[];
	}): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				`**${t('completed', language)}:**`,
			),
			...(completedReminders.length > 0 && {
				accessory: block.newButtonElement({
					text: block.newPlainTextObject(
						t('delete_all_completed_reminders', language),
					),
					style: ButtonStyle.DANGER,
					actionId: `delete-all-completed-reminders_${viewId}`,
					value: completedReminders.map(({ id }) => id).join(','),
				}),
			}),
		});
		if (completedReminders.length === 0) {
			block.addSectionBlock({
				text: block.newMarkdownTextObject(
					t('no_completed_reminders', language),
				),
			});
		}
		return block.getBlocks();
	}

	getShowCompletedRemindersButton({
		language,
		viewId,
	}: {
		language: Language;
		viewId: string;
	}): IBlock[] {
		const block = this.modify.getCreator().getBlockBuilder();
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('view_completed_reminders', language),
					),
					actionId: 'view-completed-tasks',
					value: `${viewId}`,
				}),
			],
		});
		return block.getBlocks();
	}
}
