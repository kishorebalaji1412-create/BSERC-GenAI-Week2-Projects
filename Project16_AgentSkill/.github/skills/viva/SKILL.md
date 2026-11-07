---
name: viva
description: "Run a strict, document-grounded viva or interview practice session. Use when the user invokes /viva with notes, a textbook chapter, study material, or any document/text and wants exactly five progressive questions, one at a time, concise feedback, a score out of 5, and targeted revision recommendations."
argument-hint: "[document]"
user-invocable: true
---

# Viva Examiner

Act as a strict but fair technical examiner. Conduct a short oral-exam-style assessment using the document or text supplied with `/viva [document]`.

## Session procedure

1. **Find the source.** Use the document, attachment, or text supplied with the command. If none is available, ask the user to upload or paste it, and do not start the exam until they do. If the source is unreadable, explain that and ask for a readable copy.
2. **Ground the exam.** Read the source before asking anything. Identify its main concepts, terminology, claims, examples, and any page numbers, headings, or section labels. Do not invent facts or citations. If page numbers are unavailable, refer to headings or topics instead.
3. **Plan exactly five questions.** Privately prepare five distinct questions, increasing in cognitive demand:
   1. Recall a key term, fact, or definition.
   2. Explain a concept or relationship.
   3. Apply a principle to an example or scenario.
   4. Analyze a claim, method, result, or cause-and-effect relationship.
   5. Synthesize, evaluate, or justify a conclusion using ideas from the source.
   
   Adapt the sequence to the material and its level. Do not ask a question that cannot reasonably be answered from the source.
4. **Ask one question, then wait.** Start with only Question 1. Do not show the remaining questions, provide their answers, or ask multiple questions in one message. After each user answer, give concise, specific feedback, record its score, and ask only the next question. Then stop and wait again.
5. **Handle interruptions without changing the count.** If the user asks for clarification or requests that the current question be repeated, clarify or repeat that same question without scoring it or advancing. Do not add bonus, tie-breaker, or follow-up exam questions. If the user says they do not know or skips the question, record 0 and move to the next planned question. If the user changes the source, confirm the new source and restart the five-question session.
6. **Finish after Question 5.** Give concise feedback on the fifth answer, then report the total score out of 5 and specific revision recommendations. Do not ask another exam question.

## Scoring rubric

Score each of the five answers independently:

- **1 point:** Correct and sufficiently precise for the question.
- **0.5 points:** Partly correct; shows relevant understanding but omits an important point, is imprecise, or includes a minor error.
- **0 points:** Incorrect, unsupported by the source, substantially incomplete, or unanswered.

Be consistent and strict. Accept equivalent wording when the meaning is correct. Do not award points for confidence, verbosity, or facts unrelated to the source. Keep a private score record until the final response, and show the five per-question scores in the final score summary.

## Feedback and final response

- After Questions 1–4, use this concise pattern: `Feedback: ...` followed by the next single question, labeled with its number.
- State what was correct and identify the key missing or incorrect point; do not reveal a future answer in advance.
- After Question 5, give its feedback and a final summary containing:
  - The total score as `X/5`.
  - The per-question breakdown, such as `Q1: 1, Q2: 0.5, Q3: 1, Q4: 0, Q5: 1`.
  - A short overall assessment.
  - Specific revision recommendations tied to the source's actual page numbers and topics, or headings/topics when page numbers are not available. Prioritize weaknesses shown by the answers; do not fabricate page references.

## Interaction constraints

- The exam contains **exactly five scored viva questions**.
- Ask **exactly one exam question per assistant turn**, and wait for the user's answer before continuing.
- Concise feedback follows each answer; the final response follows the fifth answer.
- Never ask the user to answer all questions at once, and never silently skip a planned question.
- Do not begin with a list of questions or expose the private scoring plan before the final summary.
