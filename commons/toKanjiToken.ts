import { kana2en } from "@/commons/kana2en";
import { isKanji, isKatakana, toKatakana } from "wanakana";

export interface MojiToken {
  word_position: number; // Indexes start from 1
  surface_form: string;
  reading?: string | undefined; // Katakana only
}

// It's not just kanji, such as "市ヶ谷" (イチガヤ), "我々" (ワレワレ).
export interface KanjiToken {
  original: string;
  reading: string;
  start: number; // Indexes start from 0
  end: number;
  en: boolean;
}
/**
 * Extract useful kanji phonetic information from KuromojiToken[].
 * @example
 * ```
 * Input: tokenizer('「我々」と「関ケ原」')
 * Output:
 * [
 *  { original: '我々', reading: 'ワレワレ', start: 1, end: 3 },
 *  { original: '関ケ原', reading: 'セキガハラ', start: 6, end: 9 }
 * ]
 * ```
 */
export const toKanjiToken = async (tokens: MojiToken[]): Promise<KanjiToken[]> => {
  const texts = tokens.filter(isPhonetic).map(toSimplifiedToken);
  // console.log(`logmm tt texts: ${JSON.stringify(texts)}`);
  const result: KanjiToken[] = [];

  for (const text of texts) {
    const rubyText = await toRubyText(text);
    if (Array.isArray(rubyText)) {
      result.push(...rubyText);
    } else {
      result.push(rubyText);
    }
  }
  // console.log(`logmm tt texts result: ${JSON.stringify(result)}`);
  return result;
};

const isPhonetic = (token: MojiToken): boolean => {
  const hasKanji = /\p{sc=Han}/v.test(token.surface_form);
  if (token.reading && token.reading !== "*" && hasKanji) {
    return true;
  }
  if (token.reading && token.reading !== "*" && isKatakana(token.surface_form)) {
    return true;
  }
  return false;

  // return Boolean(token.reading && token.reading !== "*" && hasKanji );
};

interface SimplifiedToken {
  original: string;
  reading: string; // Convert Katakana to Hiragana
  start: number; // Indexes start from 0
  end: number;
  en: boolean;
}

const toSimplifiedToken = (kuromojiToken: MojiToken): SimplifiedToken => {
  return {
    original: kuromojiToken.surface_form,
    reading: kuromojiToken.reading!,
    start: kuromojiToken.word_position - 1,
    end: kuromojiToken.word_position - 1 + kuromojiToken.surface_form.length,
    en: false,
  };
};

/**
 * Disassemble SimplifiedToken into KanjiToken or KanjiToken[]
 * @param token A token with reading and original
 * @returns A KanjiToken or KanjiToken[] with reading and original
 */
const toRubyText = async (token: SimplifiedToken): Promise<KanjiToken | KanjiToken[]> => {
  // The pure Kanji words do not need to be disassembled.
  if (isKanji(token.original)) {
    return {
      original: token.original,
      reading: token.reading,
      start: token.start,
      end: token.end,
      en: false,
    };
  }
  // If the token is written in Katakana, convert it to Hiragana.
  // The reading of the token is the same as the original text.
  if (isKatakana(token.original)) {
    // token.reading = 'word';
    // Convert Katakana to Hiragana
    const en = await kana2en(token.original);
    token.reading = en;
    return {
      original: token.original,
      reading: token.reading,
      start: token.start,
      end: token.end,
      en: true,
    };
  }
  // If the token is not a pure Kanji word, disassemble it.
  return smashToken(token);
};

interface MarkToken {
  original: string;
  start: number;
  end: number;
}

type MarkTokenArray = MarkToken[] & { hybridLength: number };

// Must be a mixture of Kanji and Kana to use this function.
const smashToken = (token: SimplifiedToken): KanjiToken[] => {
  const { original, reading, start, end } = token;
  // Both \p{sc=Hira} and \p{sc=Kana} don’t contain 'ー々', which is bad.
  const kanaRegex = /(\p{sc=Hira}|\p{sc=Kana}|ー)+/dgv;
  const kanas: MarkTokenArray = [...original.matchAll(kanaRegex)].map((match) => {
    const [unknownOriginal] = match;
    const [start, end] = match.indices![0]!;
    return {
      original: toKatakana(unknownOriginal),
      start,
      end,
    };
  }) as MarkTokenArray;
  kanas.hybridLength = original.length;

  const hybridRegex = buildRegex(kanas);

  const kanjisRegex = /\p{sc=Han}+/dgv;
  const kanjis: KanjiToken[] = [...original.matchAll(kanjisRegex)].map((match) => {
    const [original] = match;
    const [startOffset, endOffset] = match.indices![0]!;
    return {
      original,
      start: start + startOffset,
      end: start + endOffset,
    };
  }) as KanjiToken[];
  // The first matching group is the entire string.
  // All that's needed is the sub-capturing group.
  const hybridMatch = reading.match(hybridRegex)?.slice(1);
  // If the number of matching groups is not equal to the number of Kanji,
  // it means that the phonetic notation does not correspond to the text.
  if (!hybridMatch || hybridMatch.length !== kanjis.length) {
    return [{ original, reading, start, end, en: false }];
  }

  kanjis.forEach((kanji, index) => {
    kanji.reading = hybridMatch[index]!;
  });

  return kanjis;
};

// Cases where phonetic notation does not correspond to text create an invalid regular expression.
const buildRegex = (kanas: MarkTokenArray): RegExp => {
  // Match empty string, actual sub-capturing group is 0.
  if (!kanas.length) {
    return /^$/v;
  }
  // "作り方" => "^(.+)リ(.+)$", "り方" => "^リ(.+)$", "作り" => "^(.+)リ$".
  const firstKana = kanas.at(0)!;
  const lastKana = kanas.at(-1)!;
  let regex = "^";
  const placeholder = "(.+)";
  if (firstKana.start) {
    regex += placeholder;
  }
  for (const kana of kanas) {
    regex += kana.original;
    if (kana !== lastKana) {
      regex += placeholder;
    }
  }
  if (lastKana.end !== kanas.hybridLength) {
    regex += placeholder;
  }
  regex += "$";
  return new RegExp(regex, "v");
};
