"""Input-output industry to NAICS sector concordance.

The reason the impact panel was deferred until now: input-output multipliers
are published for input-output industries, and the rest of this tool works in
NAICS sectors. Those are different classifications and the mapping is neither
one-to-one nor lossless.

Two levels were available. The detail table (36-10-0595) has 246 industries,
which would need output weights to aggregate into 20 NAICS sectors - and the
multiplier tables do not publish output levels, so those weights would have to
be invented. The summary table (36-10-0113) has 33 industries, which map onto
NAICS with a concordance that fits on a page and can be checked by hand.

So the tool uses the summary level, and does NOT force it into 20 sectors.
Three of the 33 span more than one NAICS sector and are left as they are, with
that stated on screen. Several NAICS sectors split into more than one
input-output industry, which is a gain rather than a loss: residential,
non-residential and engineering construction have materially different
multipliers, and that distinction is exactly the one a planner needs.

`naics` lists every NAICS sector the industry contributes to. Where it has more
than one entry the industry cannot be attributed to a single sector, and the
interface says so rather than picking one.
"""

# io_code -> (label, [naics sectors], notes)
IO_NAICS = {
    "BS11A": ("Crop and animal production", ["11"], ""),
    "BS113": ("Forestry and logging", ["11"], ""),
    "BS114": ("Fishing, hunting and trapping", ["11"], ""),
    "BS115": ("Support activities for agriculture and forestry", ["11"], ""),
    "BS210": ("Mining, quarrying, and oil and gas extraction", ["21"], ""),
    "BS220": ("Utilities", ["22"], ""),
    "BS23A": ("Residential building construction", ["23"], ""),
    "BS23B": ("Non-residential building construction", ["23"], ""),
    "BS23C": ("Engineering construction", ["23"], ""),
    "BS23D": ("Repair construction", ["23"], ""),
    "BS23E": ("Other activities of the construction industry", ["23"], ""),
    "BS3A0": ("Manufacturing", ["31-33"], ""),
    "BS410": ("Wholesale trade", ["41"], ""),
    "BS4A0": ("Retail trade", ["44-45"], ""),
    "BS4B0": ("Transportation and warehousing", ["48-49"], ""),
    "BS510": ("Information and cultural industries", ["51"], ""),
    "BS5B0": ("Finance, insurance, real estate, rental and leasing and "
              "holding companies", ["52", "53", "55"],
              "Statistics Canada publishes these as one input-output industry. "
              "It cannot be split into finance, real estate and management of "
              "companies without output weights the multiplier tables do not "
              "carry, so it is left whole."),
    "BS53C": ("Owner-occupied dwellings", ["53"],
              "An imputed industry representing the rent homeowners notionally "
              "pay themselves. It has essentially no employment and is excluded "
              "from the employment impact list."),
    "BS540": ("Professional, scientific and technical services", ["54"], ""),
    "BS560": ("Administrative and support, waste management and remediation "
              "services", ["56"], ""),
    "BS610": ("Educational services (private)", ["61"], ""),
    "BS620": ("Health care and social assistance (private)", ["62"], ""),
    "BS710": ("Arts, entertainment and recreation", ["71"], ""),
    "BS720": ("Accommodation and food services", ["72"], ""),
    "BS810": ("Other services (except public administration)", ["81"], ""),
    "NP000": ("Non-profit institutions serving households",
              ["61", "62", "71", "81"],
              "Non-profits are one input-output industry but sit across "
              "education, health, arts and other services in NAICS."),
    "GS610": ("Government education services", ["61"], ""),
    "GS620": ("Government health services", ["62"], ""),
    "GS911": ("Other federal government services", ["91"], ""),
    "GS912": ("Other provincial and territorial government services", ["91"], ""),
    "GS913": ("Other municipal government services", ["91"], ""),
    "GS914": ("Other Indigenous government services", ["91"], ""),
}

# Excluded from the employment impact list: no real jobs attach to it.
EXCLUDE = {"BS53C"}

# Every NAICS sector the rest of the tool uses.
NAICS_SECTORS = ["11", "21", "22", "23", "31-33", "41", "44-45", "48-49",
                 "51", "52", "53", "54", "55", "56", "61", "62", "71", "72",
                 "81", "91"]


def sectors_covered():
    """Which NAICS sectors have at least one input-output industry."""
    out = set()
    for code, (_, naics, _) in IO_NAICS.items():
        if code in EXCLUDE:
            continue
        for n in naics:
            out.add(n)
    return out


def industries_for(sector):
    """Input-output industries that contribute to a NAICS sector."""
    return [code for code, (_, naics, _) in IO_NAICS.items()
            if code not in EXCLUDE and sector in naics]


def check():
    """Assert the concordance is complete and internally consistent."""
    problems = []
    missing = set(NAICS_SECTORS) - sectors_covered()
    if missing:
        problems.append("NAICS sectors with no input-output industry: %s"
                        % sorted(missing))
    for code, (label, naics, _) in IO_NAICS.items():
        bad = [n for n in naics if n not in NAICS_SECTORS]
        if bad:
            problems.append("%s maps to unknown sector(s) %s" % (code, bad))
        if not naics:
            problems.append("%s maps to no sector" % code)
    return problems


if __name__ == "__main__":
    probs = check()
    print("%d input-output industries, %d excluded"
          % (len(IO_NAICS), len(EXCLUDE)))
    print("NAICS sectors covered: %d of %d"
          % (len(sectors_covered()), len(NAICS_SECTORS)))
    multi = [(c, v[1]) for c, v in IO_NAICS.items() if len(v[1]) > 1]
    print("industries spanning more than one sector: %d" % len(multi))
    for c, n in multi:
        print("   %s -> %s" % (c, n))
    split = [(s, industries_for(s)) for s in NAICS_SECTORS
             if len(industries_for(s)) > 1]
    print("sectors served by more than one industry: %d" % len(split))
    for s, i in split:
        print("   %-6s <- %s" % (s, i))
    print("problems:", probs or "none")
