"""Demo people for School of Maths. All names are invented; emails use a made-up .demo domain (not a real email domain; .test is rejected by the app's email check)."""
DOMAIN = "schoolofmaths.demo"
DEMO_PASSWORD = "DemoPass#2026"
HERO_BATCH = "Class 10 – Evening"
CLASS9_BATCH = "Class 9 – Morning"

BATCHES = [
    {"name": HERO_BATCH, "class_level": "Class 10", "monthly_fee": 2500, "academic_year": "2026-2027"},
    {"name": CLASS9_BATCH, "class_level": "Class 9", "monthly_fee": 2000, "academic_year": "2026-2027"},
]

TEACHER = {"name": "Meera Iyer", "email": f"meera.iyer@{DOMAIN}"}

_CLASS10 = ["Aarav Sharma", "Ananya Gupta", "Vihaan Reddy", "Diya Patel", "Arjun Nair", "Ishita Verma",
            "Kabir Singh", "Saanvi Joshi", "Reyansh Kulkarni", "Myra Kapoor", "Aditya Menon", "Kiara Bose",
            "Vivaan Malhotra", "Anika Das", "Rohan Chatterjee", "Tara Pillai", "Dhruv Agarwal", "Meher Sethi",
            "Arnav Rao", "Pari Mishra", "Laksh Bhatia", "Zara Khan", "Krish Saxena", "Riya Deshmukh",
            "Yash Thakur"]
_CLASS9 = ["Aditi Rane", "Shaurya Jain", "Navya Iyer", "Atharv Pandey", "Sara Fernandes", "Rudra Chauhan",
           "Avni Shetty", "Ayaan Qureshi", "Prisha Banerjee", "Om Tiwari", "Kavya Hegde", "Neel Bajaj"]


def _email(name):
    first, last = name.lower().split()
    return f"{first}.{last}@{DOMAIN}"


STUDENTS = ([{"name": n, "email": _email(n), "batch": HERO_BATCH} for n in _CLASS10]
            + [{"name": n, "email": _email(n), "batch": CLASS9_BATCH} for n in _CLASS9])
HERO_EMAIL = _email("Aarav Sharma")

# Join requests left pending so the "approve students" shot has something to approve
PENDING_JOIN = {_email("Yash Thakur"), _email("Neel Bajaj")}

# Fee picture: most paid, a few pending, a couple partial
FEE_PENDING = {_email("Krish Saxena"), _email("Laksh Bhatia"), _email("Om Tiwari")}
FEE_PARTIAL = {_email("Rohan Chatterjee"), _email("Atharv Pandey")}


def hero_batch_students():
    return [s for s in STUDENTS if s["batch"] == HERO_BATCH and s["email"] not in PENDING_JOIN]
