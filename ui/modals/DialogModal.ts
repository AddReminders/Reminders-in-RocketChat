import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { TextObjectType } from '@rocket.chat/apps-engine/definition/uikit/blocks';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { Language, t } from '../../lib/Translation/translation';

export const dialogModal = ({
	title,
	text,
	modify,
	viewId,
	language,
}: {
	viewId?: string;
	title?: string;
	text: string;
	modify: IModify;
	language: Language;
}): IUIKitModalViewParam => {
	const block = modify.getCreator().getBlockBuilder();
	block.addSectionBlock({
		text: block.newMarkdownTextObject(text),
	});
	return {
		id: viewId || 'reminder-dialog-modal',
		title: {
			type: TextObjectType.PLAINTEXT,
			text: title || t('reminder_notification', language),
		},
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('close', language)),
		}),
		blocks: block.getBlocks(),
	};
};
