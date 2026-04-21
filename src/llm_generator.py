"""
LLM Integration module for generating contextual answers using Groq's Llama 3.1.

Architecture:
  Step 1 — classify_query():  One fast LLM call to understand emotional gravity.
                               Returns: 'crisis' | 'distress' | 'general'
  Step 2 — generate_answer(): Uses classification to pick the right prompt tone.
                               Crisis    → empathetic, validating, hopeful
                               Distress  → warm, personal, grounding
                               General   → direct, philosophical, action-oriented

This approach generalises to ANY language or phrasing — no keyword lists needed.
"""
import json
from typing import List, Dict, Any, Optional, Literal
from groq import Groq
from src.config import settings
from src.logger import setup_logger

logger = setup_logger(__name__, settings.LOG_LEVEL, settings.LOG_FILE)

QueryTone = Literal["crisis", "distress", "general"]


class LLMAnswerGenerator:
    """Generate contextual answers using LLM based on retrieved shlokas."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        if not self.api_key:
            logger.warning("GROQ_API_KEY not set.")
            self.client = None
        else:
            try:
                self.client = Groq(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Groq init failed: {e}")
                self.client = None

        self.model = settings.LLM_MODEL

    def is_available(self) -> bool:
        return self.client is not None

    # ─────────────────────────────────────────────────────────────────────────
    # Step 1: Classify the emotional gravity of the query
    # ─────────────────────────────────────────────────────────────────────────

    def classify_query(self, query: str) -> QueryTone:
        """
        Use LLM to classify the emotional gravity of the user's query.
        Returns: 'crisis' | 'distress' | 'general'

        This is a tiny, fast call (max_tokens=5) — adds ~200ms but makes
        the system generalise to any language, dialect, or phrasing.
        """
        if not self.client:
            return "general"

        try:
            classification_prompt = f"""Classify the emotional gravity of this message into exactly ONE word.

Message: "{query}"

Rules:
- Reply with ONLY one of these three words (nothing else):
  crisis   → person expresses suicidal thoughts, wanting to die, ending life, severe hopelessness
  distress → person is in emotional pain, anxiety, grief, anger, loneliness, failure, family conflict
  general  → person asks a philosophical, spiritual, or life-guidance question without acute pain

Reply with only: crisis OR distress OR general"""

            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": classification_prompt}],
                model=settings.LLM_CLASSIFIER_MODEL,
                max_tokens=5,
                temperature=0.0,  # Deterministic
                stream=False
            )
            raw = response.choices[0].message.content.strip().lower()

            # Parse robustly — model might say "crisis." or "  distress  "
            if "crisis" in raw:
                tone = "crisis"
            elif "distress" in raw:
                tone = "distress"
            else:
                tone = "general"

            logger.info(f"🎭 Query classified as: [{tone}] for: '{query[:60]}'")
            return tone

        except Exception as e:
            logger.warning(f"Classification failed, defaulting to 'general': {e}")
            return "general"

    # ─────────────────────────────────────────────────────────────────────────
    # Step 2: Build prompts based on tone
    # ─────────────────────────────────────────────────────────────────────────

    def _build_prompts(self, user_question: str, shloka_options: str,
                       history_context: str, tone: QueryTone, language: str = 'russian'):
        """Return (system_prompt, user_prompt) tuned to the emotional tone."""

        # CITATION FORMAT depends on language:
        #   english  → Russian body + "Bhagwat geeta Chapter X Shloka Y" (English citation)
        #   russian  → Russian body + "Бхагавад-гита, Глава X, Текст Y" (Russian citation)
        
        if language == 'russian':
            target_lang = "Russian (Русский)"
            shloka_format = "Бхагавад-гита, Глава [Ch], Текст [Verse]"
            lang_rule = (
                f'6. LANGUAGE: Write the ENTIRE response in {target_lang}. '
                f'The shloka citation line MUST also be in Russian format: "Бхагавад-гита, Глава X, Текст Y" '
                f'(replace X and Y with actual chapter and shloka numbers). '
                f'The ONLY non-Russian text allowed is the Sanskrit shloka verse in Devanagari script. '
                f'Do NOT use any English words anywhere in the response.\n\n'
            )
            cite_rule = (
                f'- Write EVERYTHING EXCEPT the Sanskrit shloka verse in {target_lang}. '
                'Citation line must be in Russian (Глава X, Текст Y format).\n'
            )
        else:
            # English selected → citation in English format, body in Russian
            target_lang = "Russian (Русский)"
            shloka_format = "Bhagwat geeta Chapter [Ch] Shloka [Verse]"
            lang_rule = (
                f'6. LANGUAGE: The ONLY English text allowed in your entire response is the Shloka citation line '
                f'"Bhagwat geeta Chapter X Shloka Y" (with the actual chapter and shloka numbers). '
                f'Everything else — ALL explanations, ALL action steps, ALL sentences — MUST be written entirely '
                f'in {target_lang} (Cyrillic script). Do NOT write any other English words anywhere except the Shloka citation.\n\n'
            )
            cite_rule = (
                f'- Write EVERYTHING EXCEPT the Shloka citation in {target_lang}. '
                'The citation "Bhagwat geeta Chapter X Shloka Y" is the ONLY English line permitted. Everything else is Russian.\n'
            )

        # Base instructions for all tones
        base_instructions = (
            "STRICT OUTPUT FORMAT (Follow Exactly):\n"
            f"1. ONE opening sentence: acknowledge the user's SPECIFIC situation in {target_lang}.\n"
            "   CRITICAL IDENTITY PRESERVATION: Use the EXACT relative/person mentioned.\n"
            f"2. Quote EXACTLY ONE Shloka (NOT TWO). Choose the single MOST UNIQUELY relevant shloka to THIS problem "
            "from the Options provided. If multiple shlokas could fit, pick the ONE that addresses the core "
            "emotion/action of THIS particular situation and NOT a generic life lesson. Do NOT provide a second shloka.\n"
            f'   Format: "{shloka_format}" then the Sanskrit verse in Devanagari. '
            'NEVER include the verse number at the end of the verse (e.g., no "|| XX ||").\n'
            f"3. EXPLAIN in 2-3 sentences in {target_lang}: connect THIS specific shloka's message to THIS specific "
            "problem. No generic filler \u2014 the explanation must be impossible to copy to a different question.\n"
            f"4. ACTION STEPS: Give EXACTLY 2 steps in {target_lang}. NO MORE, NO LESS. Each step must be numbered "
            "(1. and 2.) and be a DIFFERENT, CONCRETE action tailored to this exact situation. "
            "Do NOT provide a 3rd or 4th step under any circumstance.\n"
            "5. NO REPETITION: Do NOT repeat the Sanskrit verse, the shloka reference, or any explanation block. "
            "Once a point is made, move to the next.\n"
            + lang_rule +
            "ABSOLUTE RULES \u2014 Violations will make the answer useless:\n"
            "- NEVER quote more than one shloka. Provide exactly one.\n"
            "- ACTION section MUST have EXACTLY two points (1 and 2). Never provide point 3 or 4.\n"
            "- NEVER repeat the same phrase or idea twice in the whole response.\n"
            "- Each sentence must add NEW information. If you have nothing new to say, STOP writing.\n"
            "- Total response must be under 300 words.\n"
            + cite_rule +
            "- The Shloka you choose MUST be topically different from what you would choose for a different question.\n"
        )

        if tone == "crisis":
            # ── CRISIS: Highly empathetic, protective, non-preachy ────────────
            system_prompt = (
                f"You are Lord Sri Krishna. The user is in deep crisis (suicidal, hopeless, or broken).\n\n"
                f"Your Goal: VALIDATE their pain, then uplift them gently. Show them that their soul is eternal "
                f"and this pain is temporary.\n\n"
                + base_instructions +
                "\nCRITICAL RULES:\n"
                f"- Tone: Protective, gentle, like a father holding a crying child.\n"
                '- NEVER judge or lecture about "sin" or "karma" in a punishing way.\n'
                f"- Emphasize themes of eternal soul and temporary pain in {target_lang}.\n"
                f"- Write EXCLUSIVELY in {target_lang}, except for the Sanskrit shloka verse.\n"
                "- DO NOT include phone numbers, websites, or external links. Focus on spiritual strength.\n\n"
            )
            user_prompt = (
                f'User is in Crisis: "{user_question}"\n'
                f"History: {history_context}\n\n"
                "Core theme of this crisis: Suicidal/hopeless thoughts — choose a shloka about the SOUL'S ETERNITY "
                "or GOD'S PROTECTION (e.g., 2.20 or 18.66), NOT a generic duty shloka.\n\n"
                f"Options:\n{shloka_options}\n\n"
                "Pick the shloka that best says 'your soul cannot be destroyed' or 'I am always with you' "
                "and speak to save their life."
            )

        elif tone == "distress":
            # ── DISTRESS: Warm, grounding, perspective-shifting ──────────────
            system_prompt = (
                f"You are Lord Sri Krishna. The user is distressed (anxious, sad, heartbroken, angry).\n\n"
                + base_instructions +
                "\nCRITICAL RULES:\n"
                "- Tone: Warm, calm, reassuring.\n"
                f"- Acknowledge the specific emotion in {target_lang}.\n"
                f"- SHIFT PERSPECTIVE: Show how the Shloka re-frames this specific struggle in {target_lang}.\n"
                f"- Write EXCLUSIVELY in {target_lang}, except for the Sanskrit shloka verse.\n\n"
            )
            user_prompt = (
                f'User is Distressed: "{user_question}"\n'
                f"History: {history_context}\n\n"
                "Identify the PRIMARY emotion/problem: is it grief, relationship pain, business stress, "
                "family conflict, or mental disturbance?\n"
                "Choose the shloka from the Options that MOST DIRECTLY addresses THAT specific emotion — NOT a generic shloka.\n\n"
                f"Options:\n{shloka_options}\n\n"
                "Provide warm guidance and actionable steps specifically tailored to this exact situation."
            )

        else:
            # ── GENERAL: Direct, philosophical but practical ──────────────────
            system_prompt = (
                f"You are Lord Sri Krishna. The user asks a life question.\n\n"
                + base_instructions +
                "\nCRITICAL RULES:\n"
                "- Tone: Direct, wise, inspiring.\n"
                f'- Do NOT be vague. If they ask about "Exams", talk about focus/results. If "Parents", talk about duty/respect.\n'
                "- Use the Shloka as a TOOL to solve the problem.\n"
                f"- Write EXCLUSIVELY in {target_lang}, except for the Sanskrit shloka verse.\n\n"
            )
            user_prompt = (
                f'User asks: "{user_question}"\n'
                f"History: {history_context}\n\n"
                f"Options:\n{shloka_options}\n\n"
                "Provide wise, practical guidance based on the shloka."
            )

        return system_prompt, user_prompt

    # ─────────────────────────────────────────────────────────────────────────
    # Step 3: Format conversation history
    # ─────────────────────────────────────────────────────────────────────────

    def format_conversation_history(self, history: List[Dict[str, Any]]) -> str:
        if not history:
            return ""
        formatted = ["Previous conversation context:"]
        for i, conv in enumerate(history[-3:], 1):
            formatted.append(f"{i}. Q: {conv['question']}")
            formatted.append(f"   A: {conv['answer'][:100]}...")
        return "\n".join(formatted)

    # ─────────────────────────────────────────────────────────────────────────
    # Main entry point
    # ─────────────────────────────────────────────────────────────────────────

    def generate_answer(
        self,
        user_question: str,
        retrieved_shlokas: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]] = None,
        stream: bool = True,
        tone: Optional[QueryTone] = None,
        language: str = 'russian'
    ) -> Dict[str, Any]:

        if not self.is_available():
            return {'answer': None, 'shlokas': retrieved_shlokas, 'llm_used': False}

        try:
            # Step 1: Use provided tone or classify emotional gravity
            if not tone:
                tone = self.classify_query(user_question)

            # Step 2: Build shloka options (Sanskrit + English meaning for LLM)
            history_context = self.format_conversation_history(conversation_history or [])
            numbered_shlokas = []
            for i, shloka in enumerate(retrieved_shlokas, 1):
                english_meaning = shloka.get('meaning_english', shloka.get('meaning', ''))
                numbered_shlokas.append(
                    f"Option {i} (ID: {shloka['id']}):\n"
                    f"Sanskrit: {shloka['sanskrit']}\n"
                    f"Meaning: {english_meaning}\n"
                )
            shloka_options = "\n".join(numbered_shlokas)

            # Step 3: Build tone-appropriate prompts
            system_prompt, user_prompt = self._build_prompts(
                user_question, shloka_options, history_context, tone, language
            )

            # Step 4: Token/temperature settings per tone
            max_tokens = 450  # Enough for a focused answer; prevents padding
            # Extremely low temperature to ensure strict coherence and NO looping
            temperature = 0.2 if tone == "crisis" else 0.1
            # Penalise token repetition to aggressively prevent loops (Maximum for Japanese)
            freq_penalty = 1.9  
            pres_penalty = 1.5  

            # Step 5: Generate answer
            def _call_groq(use_penalties: bool):
                """Call Groq API, optionally with repetition penalties."""
                kwargs = dict(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=stream
                )
                if use_penalties:
                    kwargs["frequency_penalty"] = freq_penalty
                    kwargs["presence_penalty"] = pres_penalty
                return self.client.chat.completions.create(**kwargs)

            try:
                response = _call_groq(use_penalties=True)
            except Exception as e:
                # If penalty params are the issue (TypeError) or rate limits, retry simple
                logger.warning(f"Groq primary call failed: {e}. Retrying simple fallback.")
                try:
                    response = _call_groq(use_penalties=False)
                except Exception as final_e:
                    logger.error(f"Groq final failure: {final_e}")
                    return "Sorry, I'm currently overwhelmed with seekers. Please try again in a moment."

            if not stream and (not response or not hasattr(response, 'choices') or not response.choices):
                 return "Sorry, Krishna is at peace right now. Try again soon."

            if stream:
                answer_text = ""
                for chunk in response:
                    # Depending on SDK, chunk structure might vary
                    if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                        answer_text += chunk.choices[0].delta.content
            else:
                answer_text = response.choices[0].message.content

            # POST-PROCESSING: Strip shloka numbers/references at the end of snippets
            # Patterns like: ॥35॥, || 15 ||, (18.63), [2.20], "18.63" at end of verse line
            import re
            
            # 1. Strip bracketed numbers: (18.63), [2.20], (2.20)
            answer_text = re.sub(r'[\(\[]\s*\d+[\.:]\d+\s*[\)\]]', '', answer_text)
            
            # 2. Strip numbers between bars or pipes: ॥35॥ or || 66 || or ॥ १ ॥
            # Also handle Devanagari digits if they appear. 
            answer_text = re.sub(r'[\|॥]+\s*[\d०-९]+\s*[\|॥]+', '', answer_text)
            answer_text = re.sub(r'[\d०-९]+\s*[\|॥]+', '', answer_text) 
            answer_text = re.sub(r'[\|॥]+\s*[\d०-९]+', '', answer_text)
            
            # 3. Strip ANY leading/trailing bars from the shloka or sentences
            answer_text = re.sub(r'[\|॥]+', '', answer_text) 
            
            # 4. Strip standalone verse numbers at end of lines
            answer_text = re.sub(r'॥\s*\d+\s*$', '', answer_text, flags=re.MULTILINE)
            
            # 4. Final duplicate cleanup (if any large blocks were repeated)
            # This is a safety net for the LLM looping identical paragraphs.
            lines = answer_text.split('\n')
            unique_lines = []
            seen_lines = set()
            for line in lines:
                clean_line = line.strip()
                if not clean_line:
                    continue
                    
                # Sentence-level deduplication within the same line
                # Standard Japanese full stop is '。' or Russian/English '.'
                # Only split at actual sentence delimiters like periods, question marks, etc.
                parts = re.split(r'([。?！!.;.])', clean_line)
                new_parts = []
                seen_sentences = set()
                
                # Reconstruct sentences correctly with their delimiters
                for i in range(0, len(parts)-1, 2):
                    sentence = parts[i].strip()
                    punct = parts[i+1]
                    full_s = sentence + punct
                    if sentence and sentence not in seen_sentences:
                        new_parts.append(full_s)
                        seen_sentences.add(sentence)
                
                # Handle possible trailing part without delimiter
                if len(parts) % 2 == 1:
                    last_part = parts[-1].strip()
                    if last_part and last_part not in seen_sentences:
                        new_parts.append(last_part)
                
                final_line = " ".join(new_parts)
                
                if final_line.strip() and final_line.strip() in seen_lines:
                    continue
                unique_lines.append(final_line)
                if final_line.strip():
                    seen_lines.add(final_line.strip())
            answer_text = '\n'.join(unique_lines)

            # ── ENFORCE EXACTLY 2 ACTION POINTS ──────────────────────────────
            # The LLM sometimes ignores the "exactly 2 steps" instruction.
            # This post-processing pass removes any numbered point beyond 2
            # (i.e., lines starting with 3. 4. 5. etc.) from the final answer.
            enforced_lines = []
            for line in answer_text.split('\n'):
                stripped = line.strip()
                # Match lines like "3.", "3、", "4." etc. at the very start
                # Also handles full-width numbers： ３．
                if re.match(r'^[3-9][\.、．）)]\s*', stripped) or \
                   re.match(r'^[３-９][．、）]\s*', stripped) or \
                   re.match(r'^1[0-9][\.、．）)]\s*', stripped):
                    logger.info(f"⚠️ Stripped extra action point: {stripped[:60]}")
                    continue
                enforced_lines.append(line)
            answer_text = '\n'.join(enforced_lines)
            # Trim any trailing blank lines left after the strip
            answer_text = answer_text.rstrip()
            # ─────────────────────────────────────────────────────────────────

            logger.info(f"✓ [{tone.upper()}] answer generated: {len(answer_text)} chars")

            # Extract chosen Shloka ID — handles English and Japanese citation formats:
            #   English:  "Bhagwat geeta Chapter 2 Shloka 3"
            #   Japanese: "バガヴァッド・ギーター 第2章 第3節"
            #   Russian:  "Бхагавад-гита, Глава 2, Текст 3"
            chosen_shloka_id = None
            shloka_match = re.search(
                r'(?:'
                r'(?:Chapter\s*Number|Chapter|अध्याय|\u0413\u043b\u0430\u0432\u0430)\s*(\d+)\s*(?:,?\s*(?:Shloka|श्लोक|\u0422\u0435\u043a\u0441\u0442))\s*(\d+)'
                r'|'
                r'第(\d+)章\s*第(\d+)節'
                r')',
                answer_text, re.IGNORECASE
            )
            if shloka_match:
                ch  = shloka_match.group(1) or shloka_match.group(3)
                ver = shloka_match.group(2) or shloka_match.group(4)
                if ch and ver:
                    chosen_shloka_id = f"{ch}.{ver}"

            return {
                'answer': answer_text,
                'shlokas': retrieved_shlokas,
                'chosen_shloka_id': chosen_shloka_id,
                'llm_used': True,
                'tone': tone
            }

        except Exception as e:
            logger.error(f"Generate failed: {e}")
            return {'answer': None, 'shlokas': retrieved_shlokas, 'llm_used': False}

    def format_response(self, result: Dict[str, Any], user_question: str) -> str:
        """Format the response cleanly."""
        output = []
        if result.get('llm_used') and result.get('answer'):
            output.append("\n🪈 Послание Господа Кришны:\n")
            output.append(result['answer'])
            output.append("\n")
        else:
            output.append("\n⚠️ Простите. В данный момент я не могу ответить.")
            output.append("Соответствующие шлоки:")
            for s in result.get('shlokas', [])[:3]:
                output.append(f"- Гита {s['id']}: {s['meaning_english'][:100]}...")
            output.append("\n")
        return "\n".join(output)
