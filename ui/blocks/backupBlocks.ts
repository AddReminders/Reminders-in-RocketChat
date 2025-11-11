import { Language, t } from '../../lib/Translation/translation';
import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { Links } from '../../enums/Links';
import { ButtonStyle, IBlock } from '@rocket.chat/apps-engine/definition/uikit';

export const getBackupActionMessageBlock = ({
	modify,
	language,
}: {
	modify: IModify;
	language: Language;
}): IBlock[] => {
	const block = modify.getCreator().getBlockBuilder();

	block.addSectionBlock({
		text: block.newMarkdownTextObject(t('backup_action_message', language)),
	});

	block.addActionsBlock({
		elements: [
			block.newButtonElement({
				text: block.newPlainTextObject(
					t('create_backup_now', language),
				),
				actionId: 'backup-now',
				style: ButtonStyle.PRIMARY,
			}),
			block.newButtonElement({
				text: block.newPlainTextObject(t('restore_a_backup', language)),
				url: Links.RestoreBackupGuideLink,
			}),
			block.newButtonElement({
				text: block.newPlainTextObject(
					t('more_info_about_backup', language),
				),
				url: Links.BackupGuideLink,
			}),
		],
	});

	return block.getBlocks();
};
