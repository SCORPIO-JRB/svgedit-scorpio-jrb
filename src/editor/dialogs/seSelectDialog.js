import SePlainAlertDialog, { openInEditor } from './SePlainAlertDialog.js'

const seSelect = async (text, choices) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = choices
  openInEditor(dialog)
  const response = await dialog.whenClosed()
  return response.choice
}

window.seSelect = seSelect
