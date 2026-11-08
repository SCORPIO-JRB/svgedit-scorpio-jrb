/**
 * Styles shared by the dialogs of the editor (lot V1): the frame, the
 * backdrop, the fields and the buttons, read from the design tokens. Each
 * dialog lives in its own shadow root and prepends these styles to its
 * template; its own stylesheet keeps only its layout.
 *
 * A button with the class `primary` (or an id listed below) is the main
 * action of its dialog.
 */
export const dialogStyles = `
<style>
  :host {
    font-family: var(--se-font-ui);
    font-size: var(--se-font-size-control);
    line-height: var(--se-line-height-control);
    color: var(--se-text);
  }
  elix-dialog::part(backdrop) {
    background: var(--se-backdrop);
  }
  elix-dialog::part(frame) {
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-float);
    background: var(--se-surface-overlay);
    box-shadow: var(--se-shadow-menu);
    color: var(--se-text);
  }
  button,
  input[type=button],
  input[type=submit] {
    box-sizing: border-box;
    min-height: var(--se-control-size);
    padding: 0 12px;
    border: 1px solid var(--se-border-control);
    border-radius: var(--se-radius-control);
    background: transparent;
    color: var(--se-text);
    font: inherit;
    cursor: pointer;
    transition: background-color var(--se-duration-state) var(--se-ease-out);
  }
  button:hover,
  input[type=button]:hover {
    background: var(--se-control-hover);
  }
  button.primary,
  #tool_prefs_save,
  #tool_docprops_save,
  #tool_source_save,
  #export_ok,
  #storage_ok {
    border-color: transparent;
    background: var(--se-action);
    color: var(--se-action-text);
    font-weight: 600;
  }
  button.primary:hover,
  #tool_prefs_save:hover,
  #tool_docprops_save:hover,
  #tool_source_save:hover,
  #export_ok:hover,
  #storage_ok:hover {
    background: var(--se-action);
    filter: brightness(1.1);
  }
  input[type=text],
  input[type=number],
  input[type=url],
  select,
  textarea {
    box-sizing: border-box;
    min-height: var(--se-control-size);
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--se-radius-field);
    background: var(--se-control);
    color: var(--se-text);
    font: inherit;
  }
  textarea {
    padding: 8px;
    font-family: var(--se-font-mono);
  }
  input[type=text]:hover,
  select:hover,
  textarea:hover {
    border-color: var(--se-border-control);
  }
  input[type=checkbox],
  input[type=radio] {
    accent-color: var(--se-accent);
  }
  fieldset {
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-control);
  }
  legend {
    padding: 0 4px;
    color: var(--se-text);
    font-size: var(--se-font-size-title);
    font-weight: 600;
  }
  label {
    color: var(--se-text-secondary);
  }
  :focus-visible {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: 1px;
  }
</style>
`
