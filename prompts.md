Project 1: PDF Studio :
"Build an offline single-page web app for a PDF Studio in standard HTML, CSS, and JavaScript using PDF.js and pdf-lib via standard CDN script tags. The app must run completely offline with no backend or external server API. Include tabs for:   Organise: Merge, split, reorder, rotate, delete, insert blank page.   Edit: Add text, highlight, whiteout, redact text permanently, draw, and sign.   Stamp: Add page numbers, header/footer, date stamp, and text watermark.   Convert: Images to PDF, PDF to Images, PDF to Text.   Finish: File size compressor and PDF metadata editor.
Ensure all PDF operations happen entirely in the browser DOM. Include a clean sidebar, drag-and-drop file upload area, and dark-mode toggle. Return complete code for index.html, styles.css, and script.js."

Project 3: Resume Builder :
"Build a 100% offline HTML/CSS/JS Resume Builder with live A4 preview.
Features required:   Form inputs for Personal Info, Experience, Education, Projects, and Skills.   Live side-by-side A4 layout updating in real time.   Toggle between 3 visually distinct resume templates (Minimal, Modern, Creative).   Drag-and-drop section reordering.   Export to selectable PDF using window.print() formatted with @page { size: A4; margin: 0; } CSS so text remains copyable.   JSON Export/Import buttons to save and load profile data locally.
Make sure page breaks work cleanly across 2 pages without cutting text. Return full code in separate HTML, CSS, and JS blocks."

Project 7: Bill Book :
"Build a offline-first progressive billing app (PWA/HTML5) for small retail shops.
Features required:   Shop profile creation and quick-add item list with pre-saved prices.   Invoice generator supporting quantities, discounts, and custom tax percentages.   Dynamic UPI QR Code generator (using qrcode.js) that encodes a valid upi://pay?pa=YOUR_UPI_ID&pn=SHOP_NAME&am=TOTAL_AMOUNT URL so any UPI app scans the exact amount.   Daily sales summary history dashboard with LocalStorage backup.   Share receipt feature to export/download receipt as an image or trigger Web Share API for WhatsApp.
Ensure it works fully offline with responsive mobile UI. Return complete HTML, CSS, and JS." 

Project 8: Auto Rally :
"Build a 2D HTML5 Canvas racing game called Auto Rally featuring an auto-rickshaw.
Requirements:   Driveable auto-rickshaw on a 3-lap looping track with a timer and lap counter.   Touch controls (left, right, brake, boost buttons for mobile) and Arrow/WASD keyboard support.   Track items: collectible coins (+100 pts), obstacles (speed penalty), and nitro power-ups.   High score & best lap time saved in LocalStorage.   Web Audio API synthesized sound effects for engine, coin pickup, and crash with a Master Mute button.
Make graphics retro/cute using Canvas 2D drawings (no external image assets required). Return ready-to-run HTML, CSS, and JS code." 

Project 9: YouTube Focus Board :
"Create a Manifest V3 Chrome Extension called 'YouTube Focus Board'.
Features:   Content Script that injects toggle switches onto YouTube to hide Shorts, recommended sidebar, and comments.   Intelligent URL observer (MutationObserver) so DOM modifications persist when navigating between videos without a full page reload.   Popup window featuring:Today's YouTube watch time counter.   'Why are you here?' goal prompt that blocks YouTube access until answered, unlocking for 60-minute windows.   Timestamped notes notepad that seeks the active video when clicked.
Return complete files for manifest.json, content.js, popup.html, popup.js, and styles.css."

Project 10: Job Clipper :
"Create a Manifest V3 Chrome Extension named 'Job Clipper' to track job applications across job sites.
Features:   Popup UI with an interactive Kanban Board containing columns: 'Saved', 'Applied', 'Interview', 'Offered/Rejected'.   One-click 'Clip Job' button: Content script automatically parses Page Title, Company Name, URL, and Application Deadline from page DOM (with editable fallback inputs if detection fails).   Drag-and-drop card movement across Kanban stages.   Search bar and 'Export to CSV' button.   Native Chrome alarms API for deadline reminders.
Store all data using chrome.storage.local. Return complete files for manifest.json, content.js, popup.html, popup.js, and styles.css."

Project 16: Your Own Skill :
"Write a structured Agent Skill definition file (viva.md) for an AI command /viva [document].
The skill must instruct the AI to:   Accept any uploaded document/text (e.g., notes, textbook chapter).   Act as a strict technical examiner and ask exactly 5 progressive viva/interview questions, ONE AT A TIME.   Wait for the user's answer before giving concise feedback and asking the next question.   After 5 questions, calculate a total score out of 5 and provide specific page/topic revision recommendations.
Provide both the markdown definition for the skill and a sample conversation log testing it."

Project 17: Same Page, New Design :
Prompt 1 (Unstyled Baseline):

"Create a plain HTML page for a college technical symposium (before.html). Include hero title, event highlights, schedule table, cafe vendor menu section, and registration form. Use zero CSS, raw HTML tags only, and unstyled layout."

Prompt 2 (UI/UX Redesign):

"Take the EXACT textual content and structural elements from before.html and create after.html using modern web design principles. Implement clean typography (Google Fonts Inter/Outfit), a cohesive dark/neon color scheme, glassmorphism cards, responsive flexbox/grid layout, smooth micro-interactions, and mobile-first responsive breakpoints. Do not change any words from the original HTML."