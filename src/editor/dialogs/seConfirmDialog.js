import SePlainAlertDialog, { openInEditor } from './SePlainAlertDialog.js'

const seConfirm = async (text, choices) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = (choices === undefined) ? ['Ok', 'Cancel'] : choices
  openInEditor(dialog)
  const response = await dialog.whenClosed()
  return dialog.keyChoice ?? response.choice
}

window.seConfirm = seConfirm
