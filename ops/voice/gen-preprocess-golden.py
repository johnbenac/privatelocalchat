#!/usr/bin/env python3
"""Regenerate tests/fixtures/kitten-preprocess-golden.json from the KittenTTS reference pre-processor.

    /tmp/kitten-ref/bin/python ops/voice/gen-preprocess-golden.py [path/to/kittentts/preprocess.py] [output.json]

Standard library only; the reference module is imported by path. Each case is {input, expected} where expected is
TextPreprocessor()(input) with the default options, exactly what onnx_model.py generate() runs before chunk_text.
"""
import importlib.util, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REF = sys.argv[1] if len(sys.argv) > 1 else "/tmp/kitten-src/preprocess.py"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "../../tests/fixtures/kitten-preprocess-golden.json")

spec = importlib.util.spec_from_file_location("kitten_preprocess", REF)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
pp = mod.TextPreprocessor()

CASES = [
    # plain sentences
    "The capital of France is Paris.", "Hello, world!", "It costs $5.50 on Jan 3rd, and there are 365 days.",
    "What? Really... I can't believe it!", "She said, \"Come here.\" Then she left.", "One sentence. Two sentences. Three sentences!",
    "A line\nwith a newline\r\nand a tab\there.", "   leading and trailing spaces   ", "multiple     spaces    inside",
    "Semi-colons; colons: dashes - and underscores_in_words.", "(Parentheses) [brackets] {braces} and <angle> things.",
    "Tom & Jerry went to the O'Brien's pub.", "He said it's fine; they're not sure; we've seen it; you'll see; I'd go; I'm here.",
    "Don't, won't, can't, shan't, ain't, let's, isn't, wouldn't, couldn't.", "IT'S, DON'T, CAN'T in capitals.",
    # integers
    "There are 1200 students and 42 teachers.", "0", "7", "10", "11", "12", "13", "19", "20", "21", "99", "100", "101", "110", "115", "199",
    "200", "999", "1000", "1001", "1100", "1200", "1999", "2000", "2024", "2100", "2500", "9900", "9999", "10000", "10001", "12345",
    "100000", "123456", "999999", "1000000", "1234567", "12345678", "123456789", "1000000000", "1000000000000", "999999999999999",
    "1000000000000000", "123456789012345678901234567890",
    "Numbers 1 2 3 4 5 6 7 8 9 10 in a row.", "Room 404 is on floor 12.", "007 is a spy, 0042 is a number.",
    # negatives
    "Temperature dropped to -5 degrees overnight.", "The balance is -1,200 today.", "-0", "On a scale of -10 to 10, she rated it 8.",
    "x = -3", "gpt-3 is pretty sick.", "-1", "a -2 b", "--5", "5-", "- 5",
    # decimals
    "Pi is approximately 3.14159.", "The voltage is 1.50 volts.", "Add .5 teaspoons of salt and .25 cup of milk.", "A -.05 correction was applied.",
    "There were 0 errors and 0.0 warnings.", "0.001", "10.10", "3.0", "100.", "1.2.3", "12.345.678", "version 1.2", "1,5", "0.5.", "1.007",
    "7.000000", "123456.789",
    # thousands separators
    "The population is 7,900,000,000.", "1,234", "1,234,567.89", "12,34", ",5", "5,", "1,,2", "1, 2, 3", "price,100",
    # percentages
    "Inflation rose by 3.5% last quarter.", "Stocks fell -2% today.", "50% off", "100 %", "0.25%", "12.50%", "99.9%", "1,000%", "50.0%",
    "3% of 4% of 5%", "%", "5%%", "-0.5%", "100.123456%",
    # currency
    "A coffee costs $4.99 here.", "Rent is €1,200 per month.", "The book is £9.99.", "It costs ¥10000.", "₹500 only", "₩1500 won",
    "₿0.5 held", "$1", "$0", "$0.01", "$0.10", "$1.00", "$100", "$1,000,000", "$ 25", "$25.5", "$25.555", "$85K per year", "$2.5M raised",
    "$3B deal", "$1.2T economy", "$100K budget", "$5 and €6 and £7", "$5abc", "$5k", "£1", "£1.50", "€2.99", "¥2",
    "Cost: $12,345.67!", "$.50", "US$20", "$20.", "$1,000.99.", "$$5",
    # dates
    "On January 3rd, 2024, we met.", "The date is 2024-01-15.", "Born 03/04/1990.", "Due 12/25/2023 at noon.", "Jan 3rd", "March 21st 2020",
    "1st 2nd 3rd 4th 5th", "11th 12th 13th 21st 22nd 23rd 101st 111th", "1990s", "the 80s", "'90s music", "2020s", "2000s", "1900s", "10s",
    "In the 1960s and 1970s.", "Feb. 14, 2025", "Friday the 13th", "5/6/2021", "3 May 2022",
    # times
    "The meeting starts at 3:30pm.", "Departure at 14:00.", "Alarm set for 9:05 AM.", "The server restarts at 0:00.", "12:00pm", "12:00 PM sharp",
    "The final score was 3:0.", "The display is 16:9.", "10:30:45 pm", "23:59:59", "7:5", "1:07 am", "Lunch at 12:30, dinner at 7:45 PM.",
    "3:30 x", "3:30 pm.", "3:30pmx", "ratio 1:2:3",
    # ordinals
    "She finished 1st, he came 2nd, I was 3rd.", "It's the 21st century and the 100th anniversary.", "He ran his 42nd marathon.", "On the 33rd floor.",
    "0th", "20th", "30th", "40th", "90th", "1000th", "1001st", "5th avenue", "8th", "9th", "12th", "1th", "2th", "10th", "11th", "80th", "100th",
    # phone numbers, ip
    "Call us at 555-1234 or 1-800-555-0199.", "Dial 555-123-4567 now", "Phone: (555) 123-4567", "+1 555 123 4567", "555-12345", "1555-1234",
    "Connect to server at 192.168.1.1 on port 8080.", "10.0.0.1", "255.255.255.255", "999.999.999.999", "1.2.3", "1.2.3.4.5", "ip 8.8.8.8.",
    # years, ranges
    "In 1999 and 2005 and 2024.", "year 1850", "The war lasted from 2020-2024.", "Read pages 10-20 for homework.", "Store between 5-10 degrees.",
    "pages 100-200", "1-2-3", "10-20-30", "a10-20b", "-10-20", "9-5 job", "5 - 10", "10–20", "100-", "-100",
    # fractions
    "Cut the recipe in 1/2.", "Add 3/4 cup of sugar and 1/4 teaspoon of salt.", "The team completed 2/3 of the project.",
    "The pipe is 5/8 inch in diameter.", "1/3", "2/5", "7/10", "1/100", "3/0", "0/5", "10 / 20", "and/or", "24/7", "1/2/3", "a1/2", "1 /2",
    # units
    "The trail is 42km long.", "Each package weighs 500kg.", "Water boils at 100°C.", "Download the 2.5GB model file.", "The CPU runs at 3.6GHz.",
    "Average latency is 12ms.", "5 km", "5 KM", "10 mph", "60kph", "3mg", "250ml", "500MB", "1TB", "8GB RAM", "44.1kHz", "100MHz", "5ns",
    "5µs", "5μs", "98.6°F", "37C°", "5kmh", "5 kms", "2.50GB", "0.5kg", "1.0km",
    # scale suffixes, scientific
    "We trained a 7B parameter model and a 13B variant.", "The 340M model beat the 7B on MMLU.", "1.5K salary", "2T tokens", "5k", "5m", "3B",
    "10K runs", "1M users", "Learning rate is 1e-4, weight decay 1e-5.", "Avogadro's number is 6.022E23.", "The signal is 2.5e10 Hz.",
    "1e5", "2e+3", "-3e-2", "1e0", "a1e5", "1e5x", "3.14e0",
    # model names
    "They upgraded to GPT-3.5 last month.", "This project is licensed under GPL-3.", "Requires Python-3.10 or higher.",
    "Both CUDA-11 and CUDA-12 are supported.", "GPT-4 scored 90% on the benchmark — 15% better than GPT-3.5.", "v2.0", "IPv6", "x86-64", "Llama-2-7B",
    "A-1", "ab-12-cd", "wi-fi 6", "covid-19",
    # abbreviations / titles
    "Dr. Smith lives on Main St. near Mr. Jones.", "e.g. this, i.e. that, etc.", "Prof. A. B. Cooper, Ph.D.", "Mrs. Brown and Ms. Green",
    "St. Louis vs. Chicago", "U.S.A. and U.K.", "approx. 5 min.", "No. 5", "Inc. and Corp. and Ltd.", "a.m. and p.m.",
    # urls, emails, tags
    "Visit https://example.com or email hello@example.com.", "http://a.b/c?d=1&e=2#f is a link", "see www.example.org/page now",
    "mail john.doe+tag@sub.example.co.uk please", "user@host", "@user great post!", "#NLP is fun #AI", "email me @ noon", "https://x.y",
    "<b>Hello</b> World! It's a great day.", "<p>one</p><p>two</p>", "1 < 2 and 3 > 2", "<a href=\"http://x.com\">link</a>", "a<b",
    # all caps, roman numerals, acronyms
    "NASA and the FBI and NATO", "THIS IS LOUD", "World War II ended in 1945.", "Chapter IV begins here.", "Louis XIV was king.", "mix I with V",
    "McDonald's and iPhone and eBay", "CamelCaseWord and snake_case_word",
    # emoji and unicode
    "I love it \U0001f600 so much ❤️", "\U0001f44d\U0001f44d\U0001f44d", "Café crème brûlée", "naïve façade", "Straße München",
    "Café with combining accent", "Ñoño español ¿qué?", "Привет, мир!", "你好，世界。",
    "こんにちは世界", "مرحبا بالعالم", "नमस्ते दुनिया",
    "Ελληνικά ΟΔΣ", "Mixed English русский 中文 and 123", "½ cup and ² squared", "٣٤ and ١٢٣",
    "１２３ fullwidth", "① circled", "Ŋİ dotted I", " nbsp inside ", "zero​width", "— em dash – en dash … ellipsis",
    "“Smart quotes” and ‘single’", "It’s curly, don’t you think", "100°", "5℃",
    # markdown-looking
    "# Heading\n\nSome **bold** and *italic* text.", "- item one\n- item two\n- item three", "1. First\n2. Second\n3. Third",
    "`code` and ```block``` here", "> quoted text", "[link text](https://example.com) after", "| a | b |\n|---|---|\n| 1 | 2 |", "~~strike~~ and __under__",
    "![image](pic.png)", "Use `npm install` then run `node app.js`.",
    # mixed real-world
    "Fed raises rates by 0.25%, S&P 500 drops 1.2%.", "We raised $2.5M in seed funding and are growing 20% month-over-month.",
    "The M3 chip runs at 4.05GHz with a 40M transistor GPU and 8GB RAM.", "We trained a 7B parameter model for 100 epochs at 1e-4 learning rate.",
    "The result — 42 — surprised everyone.", "He paused... then spoke.", "Order #1234 shipped on 5/6 for $19.99 (incl. 8.5% tax).",
    "Meet at 6:30 PM on the 4th floor, room 12B.", "Mix 2 1/2 cups flour with 3/4 tsp salt.", "Mile 26.2 took 3:45:10.", "He is 6'2\" and 180 lbs.",
    # empties and edge
    "", " ", "   \n\t  ", ".", "...", "!!!", "123", "$", "%", "-", "_", "a", "A", "'", "\"", "5 5 5", "1.", ".1", "..5",
]

# a 2000-character paragraph and some other long inputs
para = ("The quick brown fox jumps over the lazy dog while 3 birds sing at 7:15 AM, costing $12.50 each for the 2nd time in 1999. "
        "Dr. Who said it's 50% likely that 1,000 people will visit the 21st-century museum, 12km away, on Mar 4th. ")
CASES.append((para * 20)[:2000])
CASES.append(" ".join(["word"] * 300))
CASES.append("1234567890 " * 40)
CASES.append("Sentence number one is here. " * 30)

# generated sweeps: number-word boundaries and a range of ordinals
for n in list(range(0, 41)) + [50, 60, 70, 80, 90, 95, 99, 100, 150, 199, 250, 999, 1050, 1500, 3000, 4040, 10500, 99999, 250000, 1500000]:
    CASES.append(f"item {n} done")
for n in list(range(1, 32)) + [40, 50, 60, 70, 80, 90, 100, 101, 102, 103, 112, 120, 121, 200, 1000, 1002]:
    sfx = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    CASES.append(f"the {n}{sfx} one")

seen, golden, skipped = set(), [], []
for text in CASES:
    if text in seen:
        continue
    seen.add(text)
    try:
        golden.append({"input": text, "expected": pp(text)})
    except Exception as e:  # the reference itself raises: not a usable golden case
        skipped.append((text, repr(e)))

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(golden, f, ensure_ascii=False, indent=0)
    f.write("\n")
print(f"wrote {len(golden)} cases to {OUT}; skipped {len(skipped)} where the reference raises")
for t, e in skipped:
    print("  skipped:", repr(t)[:60], e)
