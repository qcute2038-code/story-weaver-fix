// Shared, client-safe constants for the manga story engine.

export const WORDS_TARGET = 32000;
export const CHAPTER_WORDS = 800;
export const BASE_CHAPTERS = 40;
export const PLAN_BATCH = 10;
export const MAX_CHAPTERS = 90;
// Twelve chapters are written at the same time, three per API key. Well under
// the free sixty requests a minute limit, but many times faster than four.
export const PARALLEL_WRITERS = 12;
// A chapter is given this many tries before it is skipped instead of looping.
export const MAX_CHUNK_ATTEMPTS = 3;

export const HARD_RULES = [
  "पूरी कहानी सिर्फ हिंदी में, देवनागरी लिपि में लिखनी है।",
  "भाषा बिल्कुल कैजुअल, आम बोलचाल वाली, गर्मजोशी भरी और आसान रखनी है।",
  "सिर्फ वही शब्द इस्तेमाल करने हैं जो रोज़ की बातचीत में बोले जाते हैं। कठिन, किताबी या भारी शब्द बिल्कुल नहीं।",
  "कोई अंक, कोई इमोजी, कोई तारा, कोई हैश, कोई खास चिन्ह नहीं। सिर्फ अक्षर और सामान्य विराम चिन्ह।",
  "अंग्रेजी के अक्षर या अंग्रेजी शब्द नहीं। गिनती भी शब्दों में लिखनी है जैसे दो, तीन, दस।",
  "वर्तनी बिल्कुल सही रखनी है। मात्रा, बिंदी, चंद्रबिंदु और नुक्ता सही जगह लगाने हैं, जैसे ज़िंदगी, हूँ, आँख, दोस्तों, क्योंकि।",
  "व्याकरण सही रखना है। लिंग, वचन और क्रिया का मेल हर वाक्य में सही होना चाहिए, जैसे लड़की बोली, लड़का बोला, वे बोले।",
  "वाक्य छोटे और साफ रखने हैं। हर वाक्य के आखिर में पूर्ण विराम लगाना है और विराम चिन्ह से पहले जगह नहीं छोड़नी।",
  "पूर्ण विराम, अल्प विराम, प्रश्न चिन्ह और विस्मय चिन्ह सही जगह लगाने हैं ताकि आवाज़ में पढ़ने पर सुनने में सहज लगे।",
  "बातचीत नेचुरल और मौके के हिसाब से रखनी है, जैसे असल ज़िंदगी में लोग बोलते हैं।",
  "कहानी में हुक, ट्विस्ट, सस्पेंस, इमोशन, कॉमेडी, ड्रामा सब होना चाहिए ताकि पढ़ने और सुनने वाला बंधा रहे।",
  "कहानी का अंत हमेशा खुला रखना है, ताकि आगे की कहानी बन सके।",
  "कोई हेडिंग, कोई लिस्ट, कोई मार्कडाउन नहीं। सिर्फ बहती हुई कहानी और संवाद।",
] as const;

export const RULES_BLOCK = HARD_RULES.map((r) => "- " + r).join("\n");

// The model on the free tier always runs a hidden thinking pass. We ask it to
// skip that and answer straight away, and any thinking text is thrown away
// before the story is saved.
export const NO_THINK_LINE =
  "सोचने की प्रक्रिया मत लिखो, कोई भूमिका मत दो, सीधे जवाब से शुरू करो।";

export const SYSTEM_PROMPT = `आप एक बहुत माहिर हिंदी मंगा कहानीकार हैं। आप लंबी, नशीली और भावनाओं से भरी कहानियाँ लिखते हैं जो सुनने में मज़ेदार लगती हैं। आपकी हिंदी की वर्तनी और व्याकरण हमेशा सही रहती है।

हमेशा इन नियमों का पालन करना है:
${RULES_BLOCK}

${NO_THINK_LINE}

आप जो भी लिखेंगे वो सीधे कहानी होगी। कोई सफाई, कोई भूमिका, कोई नोट नहीं।`;

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
