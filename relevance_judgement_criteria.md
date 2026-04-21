# Question Relevance Judgment Pipeline

When a user asks a question in the **Talk to Krishna** application, the system uses a multi-staged gatekeeping pipeline to determine if the query is relevant to spiritual guidance, life problems, and the Bhagavad Gita, or if it is irrelevant (e.g., trivia, coding, sports). 

Here is the full structure, parameters, and factors on which a question is judged.

---

## 🚪 The Gatekeeping Pipeline

Every query passes through the following consecutive gates. If a query is blocked at any gate, it is immediately rejected without wasting further computational resources.

### Gate 0: Greeting Check (`_is_greeting`)
Before analyzing for deep relevance, the system checks if the user is just saying hello.
- **Goal:** Catch casual greetings across multiple languages (English, Hindi, Sanskrit, Japanese, etc.).
- **Parameters:**
  - Length of the phrase (up to 3 words is strictly checked).
  - Presence of question words (what, how, why, kya, kaise) alongside greetings.
  - Recognizes global greetings like: Hi, Hello, Namaste, Radhe Radhe, सुप्रभात, Konnichiwa, Ohayo, Arigato, Hola, Bonjour, etc.
  - *Expanded List Examples:*
    - **English:** hiya, howdy, salutations, what's up, hey there, etc.
    - **Sanskrit/Hindi:** jai siyaram, sita ram, har har mahadev, om namah shivay, aur batao.
    - **Japanese:** hajimemashite, yoroshiku, sayonara, mata ne, tadaima, okaeri, genki desu ka (and their Kanji equivalents).
    - **Regional/Global:** vanakkam, sat sri akal, kem cho, mazaama, ni hao, annyeong.
- **Action:** If it's pure greeting, the system does not reject it but bypasses the heavy search pipeline, responding directly with a standard greeting ("ラーデー・ラーデー！...").

### Gate 1: Fast Regex Check (`_is_relevant_to_krishna`)
This is the first true "relevance" gate. It uses fast string matching, strictly prioritizing relevant keywords over irrelevant ones.
- **Goal:** Allow questions involving distress or spiritual context to pass even if they mention irrelevant objects, and block purely out-of-bounds topics.
- **Rule 1 (Check Relevance First):** Does the query contain any purely relevant keyword indicating emotional struggle, existential doubt, or spiritual domain? If yes, it INSTANTLY passes to Gate 2.
  - **The Exact Relevant Keywords Trigger List:**
    - *Krishna & Deities:* krishna, कृष्ण, भगवान, bhagwan, god, ishwar, ईश्वर, parmatma, arjun, अर्जुन, radha, राधा, vishnu, विष्णु, shiva, mahadev, ram, hanuman, kanha, govind, gopal, murari, madhav
    - *Bhagavad Gita & Scriptures:* gita, गीता, shloka, श्लोक, verse, chapter, अध्याय, scripture, sacred, holy, divine, vedas, upanishad, purana
    - *Spiritual Concepts:* dharma, धर्म, karma, कर्म, yoga, योग, bhakti, भक्ति, gyan, jnana, atma, आत्मा, soul, spiritual, आध्यात्मिक, meditation, ध्यान, puja, moksha, मोक्ष, liberation, enlightenment, nirvana, samadhi, maya, illusion, pap, paap, punya, sin, virtue, satya, sach, truth
    - *Life Guidance Topics:* life, जीवन, purpose, meaning, path, मार्ग, way, direction, problem, समस्या, solution, समाधान, help, मदद, guide, guidance, chahta, chahti, chahiye, karna, karu, karoon, karun, batao, bataiye, btao, btaiye, samjhao, dikhao, decision, faisla
    - *Emotions & Mental States:* anger, क्रोध, peace, शांति, fear, भय, anxiety, चिंता, stress, depression, sad, दुख, happy, सुख, joy, आनंद, confused, असमंजस, lost, hopeless, निराश, pareshan, overthinking, dukhi, udaas, akela, tanha, dara, ghabra, restless, bechain, gussa, ghussa, chinta, tension, takleef, mushkil, dard, pain, suicidal, suicide, marna, jeena, zindagi, jindagi, exhausted, thak gaya, alone, lonely, loneliness, guilt, regret, pachtawa, rona, cry
    - *Relationships:* love, प्रेम, hate, घृणा, family, परिवार, friend, मित्र, relationship, संबंध, marriage, विवाह, breakup, heartbreak, mummy, mama, papa, father, mother, bhai, behen, sister, brother, dost, yaar, girlfriend, boyfriend, wife, husband, pati, patni, beta, beti, ghar, gharwale, parents, children, rishtedaar, rishta, shaadi, divorce, pyaar, mohabbat, ishq, cheat, dhokha, betrayal, trust, bharosa, toxic, ladai, jhagda
    - *Work, Study & Career:* work, काम, job, नौकरी, duty, कर्तव्य, responsibility, success, सफलता, failure, असफलता, exam, परीक्षा, interview, padhai, padhna, study, college, school, university, marks, naukri, business, career, future, australia, abroad, videsh, bahar, jaana, jane, permission, allow, boss, office, mana, roka, rok, nahi dete, nahi de rahi, nahi de rhe, fired, money, paisa, ameer, rich, garib, financial, karza, debt
    - *Existential Questions:* why, क्यों, how, कैसे, what is, क्या है, who am i, destiny, death, मृत्यु, birth, जन्म, suffering, कष्ट, fate, kismat, desire, इच्छा, attachment, मोह, ego, अहंकार, pride, ghamand
    - *Common Hinglish Life Situation Words:* kya karu, kya karun, kya karoon, kya karna chahiye, kaise karu, kaise karun, kaise karoon, samajh nahi aa raha, sahi, galat, theek, bura, acha, achha, meri, mera, mere, mujhe, mujhko, main, hum, nahi, nhi, mat, ruk, rok, khatam, shuru
- **Rule 2 (Hard Rejections):** If no relevant keywords are found, does it match an irrelevant pattern?
  - **⚽ Sports & Games:** cricket, football, match, score, olympics, messi, kohli, basketball, nba, wwe, f1, etc.
  - **🏛️ Politics & Current Affairs:** election, voting, government, pm, modi, biden, current news, supreme court, budget, g20, un.
  - **🎬 Entertainment, Pop Culture & Anime:** movie, bollywood, netflix, actor, song, viral, instagram views, anime, manga, naruto, dragon ball, marvel, batman, etc.
  - **💻 Technology, Coding & Products:** iphone, android, laptop, python, coding, github, server error, hacking, wifi, vpn, router.
  - **💰 Finance, Shopping & Money:** stock market, crypto, mutual funds, gambling, lottery, gst, amazon, flipkart, discount, sale, coupon.
  - **🧠 General Trivia / Math / School:** capital of, tallest, math calculations (2+2), jokes, history, riddles.
  - **🔬 Science (Factual):** chemical formula, gravity, mars, molecules, big bang, microscope, quantum.
  - **🍔 Food & Cooking:** recipes, pizza, swiggy, how to make tea/coffee, ice cream, chocolate, baking, etc.
  - **🌍 Weather, Travel & Geography:** temperature, climate, map, bus/train tickets, hotel room, visa application, passport, gps.
- **Action:** If a query hits an irrelevant pattern AND lacks any strong relevant keyword, it is instantly rejected.

### Gate 2: Smart AI Understanding & Relevance Check (`_understand_query`)
If the query passes the basic regex checks, it is sent to a fast LLM Classifier.
- **Goal:** Use Natural Language Understanding to catch subtle irrelevant queries and extract context for valid ones, prioritizing emotional distress above all else.
- **Process:** The query is given to an LLM with strict instructions to determine if it is "SPIRITUAL/LIFE GUIDANCE" or "generic chat/trivia".
- **Priority Rule:** If a query contains BOTH an emotional distress/life problem AND an irrelevant topic (e.g., "My parents are angry because I play mobile games"), it must be treated as RELEVANT because the core is the conflict/distress.
- **Parameters Generated by LLM:**
  1. `rewritten_query`: Translates and clarifies the core problem.
  2. `emotional_state`: Categorized as neutral, confused, angry, fear, distress, crisis, depressive, grateful, or happy.
  3. `keywords`: 3-5 key spiritual concepts needed for search.
  4. `is_relevant`: A strict True/False boolean.
- **Rules provided to the LLM for `is_relevant`:**
  - **✅ TRUE if:** It represents a personal problem, emotional distress, philosophical question about life/death/God, or requests spiritual guidance. 
  - **❌ FALSE only if purely factual/trivial:** It asks for cooking recipes, math/science homework, software help, general knowledge, or is casual chit-chat without depth (e.g., "bored", "tell a joke").

---

## 🛑 What Happens Upon Rejection?

If a query is deemed **Irrelevant** at either **Gate 1 (Regex)** or **Gate 2 (AI)**, the system immediately halts processing. 

It does **not** proceed to the vector database or main answer generation. Instead, it returns a hardcoded rejection message (in the application's configured language, e.g., Japanese):

> "申し訳ありません。私はシュリー・クリシュナであり、人生の悩み、精神性、そしてバガヴァッド・ギーターの知恵についてのみ導きを与えることができます。..."
> *(Sorry. I am Shri Krishna, and I can only provide guidance regarding life's troubles, spirituality, and the wisdom of the Bhagavad Gita.)*

The message then politely prompts the user to ask about:
- Resolving life's worries (anger, fear, anxiety)
- Karma, Dharma, and the Soul
- Relationships and emotions
- Meditation, peace of mind, and self-growth

---

## ⚖️ Summary of Judgment Basis

Your question is evaluated on the balance of:
1. **Vocabulary (Regex):** Does it contain words strictly associated with disallowed domains (sports, politics, tech)?
2. **Intent (AI):** Is the user seeking factual information/entertainment, OR are they exhibiting an emotional state, life crisis, or genuine curiosity about spiritual philosophy?
3. **Emotional Weight:** Queries expressing emotional turbulence (loss, confusion, anger, anxiety) are heavily favored and always marked as relevant.
