import SePlainAlertDialog, { openInEditor } from './SePlainAlertDialog.js'

const seAlert = (text) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = ['Ok']
  openInEditor(dialog)
}

window.seAlert = seAlert
