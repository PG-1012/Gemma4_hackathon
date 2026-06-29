# Speedrunner Recorder (Chrome extension)

Records a web workflow once and streams it to the local backend, which writes a
runner-ready `workflow.json` plus a `recording.json` grounding sidecar.

## Install (unpacked)
1. Start the backend so the ingest endpoints + demo form are served:
   ```bash
   cd backend && python app.py     # http://localhost:8000
   ```
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   and select this `extension/` folder.

## Record
1. Open the page you want to automate (e.g. http://localhost:8000/web/expense-form.html).
2. Click the extension icon, enter a **Workflow name**, confirm the **Backend URL**,
   and click **● Start recording**.
3. Do the workflow normally — typing, dropdowns, checkboxes, file uploads, submit.
4. Click **■ Stop & save**. The popup prints the recording directory and lists any
   upload files you still need to provide.

## Uploads
The browser blocks reading a chosen file's bytes, so an upload is recorded as
`uploads/<filename>`. After stopping, drop the actual file into the recording's
`uploads/` folder so replay can re-attach it.

## Replay
```bash
cd backend
python run_demo.py --workflow workflow/recordings/<run>/workflow.json            # mock
LLM_PROVIDER=cerebras python run_demo.py --workflow workflow/recordings/<run>/workflow.json
python run_demo.py --workflow workflow/recordings/<run>/workflow.json --loops 20  # stress
```

## What gets captured
| You do | Recorded action |
|---|---|
| Type into a text/email/number field or textarea | one `fill` (final value) |
| Pick a dropdown option | `select` (option text) |
| Toggle a checkbox | `check` / `uncheck` |
| Choose a radio | `check` |
| Choose a file | `upload` |
| Click a submit button | `submit` |
| Click another button / link | `click` |
