"""AMIRNET question-bank generation pipeline.

Stages, per CLAUDE.md section 5:

    1. gold set        gold/*.jsonl — hand-written, not generated
    2. generation      generate.py
    3. auto validation validate.py
    4. blind check     verify.py
    5. manual sampling cli.py review
    6. field feedback  the app's report button, via the reports table
"""
