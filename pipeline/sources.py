"""Source registry - Hinterland.

Every number the tool can display traces back to a row in this file. Each
source declares what it is, where it came from, what the tool uses it for, and
what it cannot be trusted to say. Nothing enters analyst.db undeclared.

All sources are open government data (Statistics Canada). Statistics Canada
tables are pulled as full-table CSV zips from the Web Data Service; boundary
files come from the 2021 Census geography portal.
"""

STATCAN_ZIP = "https://www150.statcan.gc.ca/n1/tbl/csv/{pid}-eng.zip"
STATCAN_GEO = ("https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/"
               "boundary-limites/files-fichiers/{f}")


class Source:
    def __init__(self, key, title, url, purpose, caveats, vintage, filename,
                 pid=None, cite=None):
        self.key, self.title, self.url = key, title, url
        self.purpose, self.caveats = purpose, caveats
        self.vintage, self.filename = vintage, filename
        self.pid, self.cite = pid, cite

    def __repr__(self):
        return "<Source %s>" % self.key


def _fmt_pid(pid):
    p = str(pid)
    return "%s-%s-%s-01" % (p[0:2], p[2:4], p[4:8])


def statcan(key, pid, title, purpose, caveats, vintage):
    tag = _fmt_pid(pid)
    return Source(
        key=key, pid=str(pid),
        title="Statistics Canada table %s - %s" % (tag, title),
        url=STATCAN_ZIP.format(pid=pid),
        purpose=purpose, caveats=caveats, vintage=vintage,
        filename="%s_%s.zip" % (key, pid),
        cite=("Statistics Canada. Table %s. "
              "https://doi.org/10.25318/%s-eng" % (tag, tag)),
    )


SOURCES = [

    # ------------------------------------------------------------------ #
    # A. The employment base - place of WORK. This is the local economy:
    #    jobs located in the place, which is what a competitive analysis
    #    of an economy is actually about.
    # ------------------------------------------------------------------ #
    statcan(
        key="pow_industry_csd",
        pid=98100491,
        title=("Place of work status by industry sector, work activity, age and "
               "gender: Canada, provinces and territories, census divisions and "
               "census subdivisions - by place of work geography"),
        purpose=(
            "The workplace-basis employment base: jobs by NAICS sector located "
            "in each Ontario municipality (CSD) and census division. Drives the "
            "2021 structural analysis - location quotients, specialisation and "
            "diversity indices, economic base multipliers, and the jobs-to-"
            "residents comparison."
        ),
        caveats=(
            "2021 only, so it supports structure but not change. Counts are the "
            "employed labour force aged 15+ with a usual place of work or working "
            "at home, in the May 2021 reference week - a COVID-affected week: "
            "sectors under public-health closure (accommodation and food, arts "
            "and recreation, retail) are understated relative to a normal year, "
            "and work-at-home is inflated. Census random rounding to a multiple "
            "of 5 means small cells are unreliable and sector figures need not "
            "sum exactly to totals. Counts are suppressed for small areas."
        ),
        vintage="2021 Census (May 2021 reference week)",
    ),

    statcan(
        key="pow_industry_ct",
        pid=98100492,
        title=("Place of work status by industry sector, work activity, age and "
               "gender: census metropolitan areas, tracted census agglomerations "
               "and census tracts - by place of work geography"),
        purpose=(
            "The neighbourhood tier. Jobs by NAICS sector located in each census "
            "tract - the finest geography for which Statistics Canada publishes "
            "industry-of-employment data. Census tracts hold 2,500-8,000 "
            "residents and are the standard statistical proxy for a "
            "neighbourhood inside a CMA or tracted CA."
        ),
        caveats=(
            "Same reference-week and rounding caveats as 98-10-0491, but far more "
            "binding: at tract scale, random rounding to 5 and suppression make "
            "individual sector cells fragile, and the tool withholds any cell "
            "below a stated reliability floor. Census tracts exist only inside "
            "CMAs and tracted CAs, so rural and small-town Ontario has no "
            "neighbourhood tier at all. Tract boundaries are redrawn between "
            "censuses, so tract figures are 2021-only and are never differenced "
            "across census years in this tool."
        ),
        vintage="2021 Census (May 2021 reference week)",
    ),

    # ------------------------------------------------------------------ #
    # B. The long time series - place of RESIDENCE. The only industry
    #    series that runs across five censuses, so it carries shift-share.
    # ------------------------------------------------------------------ #
    statcan(
        key="res_industry_2021",
        pid=98100456,
        title=("Place of work status by industry sectors, occupation and gender: "
               "Canada, provinces, census divisions and census subdivisions"),
        purpose=(
            "Labour force by NAICS sector by municipality of RESIDENCE, 2021. "
            "The 2021 end point of the five-census series that the shift-share "
            "decomposition runs on."
        ),
        caveats=(
            "Residence basis: it counts where workers live, not where the jobs "
            "are. A commuter suburb shows a large professional-services labour "
            "force with almost no professional-services establishments. Read it "
            "as the skill profile of the resident workforce, never as the local "
            "employment base."
        ),
        vintage="2021 Census",
    ),

    statcan(
        key="pop_csd_annual",
        pid=17100155,
        title="Population estimates, July 1, by census subdivision, 2021 boundaries",
        purpose=(
            "Annual municipal population 2001-2025, already harmonised by "
            "Statistics Canada onto 2021 boundaries. Used for per-capita and "
            "density denominators, population growth in the peer-matching "
            "vector, and the jobs-per-resident ratio."
        ),
        caveats=(
            "These are adjusted for census net undercoverage, so they are "
            "deliberately NOT the census counts and the two must never be mixed "
            "in one comparison. Final intercensal to 2020, final postcensal for "
            "2021, updated postcensal 2022-2024 and preliminary for 2025, so the "
            "latest year is the least settled. Intercensal years are modelled "
            "rather than counted and small-municipality estimates carry "
            "meaningful error."
        ),
        vintage="2001-2025",
    ),

    statcan(
        key="commute_csd_2021",
        pid=98100459,
        title=("Commuting flow from geography of residence to geography of work: "
               "census subdivisions"),
        purpose=(
            "Municipality-to-municipality commuting flows. Used for the "
            "self-containment ratio (residents who both live and work in the "
            "place), the net commuting balance, and the functional-labour-market "
            "read on whether a municipality imports or exports workers."
        ),
        caveats=(
            "Covers ONLY the employed labour force with a usual place of work - "
            "a third universe, narrower than the place-of-work total, because it "
            "also excludes everyone who worked at home. For Toronto that is "
            "649,000 of 1,308,000 employed residents. Never divide a commuting "
            "figure by a total from another table. 2021 only, and the May 2021 "
            "reference week distorts flows: a resident working from home leaves "
            "this table entirely. Flows below the suppression threshold are "
            "withheld, so row sums fall short of totals."
        ),
        vintage="2021 Census",
    ),

    statcan(
        key="business_counts",
        pid=33101097,
        title="Canadian business counts, with employees, by census subdivision",
        purpose=(
            "Establishment counts by NAICS and employment-size band, by "
            "municipality. An independent, non-census, workplace-basis check on "
            "industry structure, and much more current than the census."
        ),
        caveats=(
            "Counts statistical LOCATIONS, not jobs and not firms: a 900-person "
            "plant and a 9-person shop each count once, and a chain with ten "
            "stores and a head office counts eleven times. Coverage is "
            "conditional - every municipality inside a census metropolitan area, "
            "but outside one only those with ten or more active businesses, "
            "which is why 426 of Ontario's 577 municipalities appear and the "
            "missing ones are small and rural rather than suppressed. Uses NAICS "
            "2022 where the census tables use NAICS 2017. The employment size "
            "bands must not be used to compute a number of employees. A single "
            "snapshot, replaced each period, so it carries no time series. Never "
            "used in the shift-share calculation - structural cross-reference "
            "only."
        ),
        vintage="July 2025 snapshot",
    ),

    statcan(
        key="io_multipliers_prov",
        pid=36100595,
        title="Input-output multipliers, provincial and territorial, detail level",
        purpose=(
            "NOT USED by the interface, and kept deliberately. The impact "
            "panel runs on the 33-industry summary table (36-10-0113) "
            "instead, because aggregating these 246 detail industries into "
            "the tool's 20 NAICS sectors would need output weights that the "
            "multiplier tables do not publish - so those weights would have "
            "to be invented, and an invented weight is indistinguishable "
            "from a result. This table is loaded and held because it is the "
            "right source the moment those weights become available, and "
            "because the summary figures can be sanity-checked against it. "
            "No number on screen comes from here."
        ),
        caveats=(
            "Provincial multipliers, not municipal. Applying them to a "
            "municipality overstates local capture because a smaller economy "
            "leaks more spending; the FLQ adjustment reduces but does not remove "
            "this bias. Multipliers assume fixed technical coefficients, no "
            "capacity constraints and no price response - they answer what the "
            "current structure implies and are not a forecast."
        ),
        vintage="2022 reference year",
    ),

    statcan(
        key="ct_population",
        pid=98100014,
        title=("Population and dwelling counts: census metropolitan areas, "
               "tracted census agglomerations and census tracts"),
        purpose=(
            "Statistics Canada published census-tract population, dwellings "
            "and land area, held as an INDEPENDENT CHECK on the geography "
            "spine rather than as a source of displayed figures. Every tract "
            "population the tool shows is aggregated up from the 137,867 "
            "dissemination blocks in the geographic attribute file; this is "
            "the published total those sums are verified against, and "
            "pipeline/validate.py asserts the two agree."
        ),
        caveats=(
            "Tract population counts are unadjusted for census undercoverage, "
            "which makes them CENSUS COUNTS and not comparable with the "
            "annual population estimates in 17-10-0155; the two are kept in "
            "separate tables and are never differenced. Land area is gross, "
            "including water and undevelopable land, so density is a gross "
            "rather than net figure. Carries member footnotes 2 and 3, which "
            "mark tracts affected by incompletely enumerated reserves and "
            "settlements - a real gap in several Ontario First Nations."
        ),
        vintage="2021 Census",
    ),

    statcan(
        key="io_multipliers_summary",
        pid=36100113,
        title="Input-output multipliers, summary level, provincial and territorial",
        purpose=(
            "Ontario input-output multipliers at the 33-industry summary level. "
            "This is the level the tool uses rather than the 246-industry detail "
            "table, because 33 summary industries map onto the 20 NAICS sectors "
            "with a concordance that can be written down and checked, where the "
            "detail table would need output weights the multiplier tables do not "
            "publish. Type I and Type II multipliers are dimensionless ratios - "
            "total jobs per direct job - so an employment impact can be computed "
            "without needing dollar output at all."
        ),
        caveats=(
            "PROVINCIAL multipliers. Applying them to a municipality overstates "
            "local capture, because a smaller economy buys more of its inputs "
            "from outside itself; the tool scales the indirect and induced parts "
            "down by a Flegg-Webber factor, which reduces the bias without "
            "removing it. Fixed technical coefficients, no capacity constraints "
            "and no price response: they answer what the current structure "
            "implies, and are not a forecast. Induced effects (Type II) assume "
            "household spending patterns hold and are the least reliable part. "
            "Three industries span more than one NAICS sector and cannot be "
            "split - finance/insurance/real estate/management is one industry "
            "here, as are non-profit institutions. Owner-occupied dwellings is "
            "an imputed industry with no real employment and is excluded."
        ),
        vintage="2019-2022",
    ),

    # ------------------------------------------------------------------ #
    # D. Demography - why a place grew, not just that it did
    # ------------------------------------------------------------------ #
    statcan(
        key="components_cd_2021b",
        pid=17100153,
        title="Components of population change by census division, 2021 boundaries",
        purpose=(
            "Annual births, deaths, immigration, emigration, and net "
            "inter-provincial and intra-provincial migration for every Ontario "
            "census division, 2001 to 2024. This is the layer that answers why "
            "a place grew: natural increase, people arriving from elsewhere in "
            "Ontario, or immigration are three completely different planning "
            "conversations, and population change alone cannot tell them apart."
        ),
        caveats=(
            "Census division, not municipality - Statistics Canada does not "
            "publish components of change below the CD level, so a fast-growing "
            "municipality inside a slow-growing CD is invisible here. Estimates, "
            "not counts: they carry the same postcensal revision cycle as the "
            "population estimates, and the most recent years are preliminary. "
            "Intra-provincial migration is measured from tax filings and lags "
            "moves by people who do not file."
        ),
        vintage="2001-2024",
    ),

    statcan(
        key="components_cd_2001b",
        pid=17100038,
        title=("Components of population growth, census divisions and census "
               "metropolitan areas, 2001 Census boundaries"),
        purpose=(
            "The same components back to 1986, which is what gives the "
            "demographic layer real depth - two full decades before the series "
            "above begins."
        ),
        caveats=(
            "On 2001 census boundaries, where the table above is on 2021 "
            "boundaries. The two are NOT one series and the tool never joins "
            "them into a single line without marking the break. Ontario "
            "reorganised its municipalities heavily between 1996 and 2001 and a "
            "handful of census divisions changed with them - Haldimand-Norfolk "
            "most visibly. Component definitions also differ slightly: this "
            "table reports in- and out-migration separately where the newer one "
            "reports net."
        ),
        vintage="1986-2006",
    ),

    # ------------------------------------------------------------------ #
    # C. Geography
    # ------------------------------------------------------------------ #
    Source(
        key="ct_boundaries",
        title="2021 Census - census tract cartographic boundary file (lct_000b21a_e)",
        url=STATCAN_GEO.format(f="lct_000b21a_e.zip"),
        purpose="Census tract polygons for the neighbourhood map and shapefile export.",
        caveats=("Cartographic (generalised) boundaries, simplified for display; "
                 "not suitable for precise area or boundary determination. "
                 "Lambert conformal conic (EPSG:3347), reprojected to WGS84 for "
                 "the web map."),
        vintage="2021", filename="ct_boundaries_lct_000b21a_e.zip",
        cite=("Statistics Canada. 2021 Census - Boundary files. "
              "Catalogue no. 92-160-X."),
    ),

    Source(
        key="csd_boundaries",
        title="2021 Census - census subdivision cartographic boundary file (lcsd000b21a_e)",
        url=STATCAN_GEO.format(f="lcsd000b21a_e.zip"),
        purpose="Municipal polygons for the municipal map and shapefile export.",
        caveats=("Cartographic (generalised) boundaries. 2021 vintage only: "
                 "municipalities that amalgamated or dissolved before 2021 are "
                 "not represented."),
        vintage="2021", filename="csd_boundaries_lcsd000b21a_e.zip",
        cite=("Statistics Canada. 2021 Census - Boundary files. "
              "Catalogue no. 92-160-X."),
    ),

    Source(
        key="geo_attribute",
        title="2021 Census - geographic attribute file (92-151-X)",
        url=("https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/"
             "attribute-attribs/files-fichiers/2021_92-151_X.zip"),
        purpose=("The geography spine: which CSD sits in which census division, "
                 "economic region, CMA/CA and census tract, plus the Statistical "
                 "Area Classification type used to build like-for-like peer "
                 "groups. Also carries land area for density."),
        caveats=("2021 vintage. The Statistical Area Classification describes "
                 "metropolitan influence, not economic performance - it is used "
                 "here only to restrict peer candidates to settlements of a "
                 "comparable kind."),
        vintage="2021", filename="geo_attribute_92-151-X.zip",
        cite="Statistics Canada. 2021 Census - Geographic attribute file, 92-151-X.",
    ),
]

# Long-run residence-basis industry series (2001, 2006, 2011, 2016). These four
# census vintages are published as Census Profile / NHS bulk files rather than
# WDS cubes; the loader reads them from the local raw cache and records their
# provenance here.
# The 2016 leg of the shift-share series, re-sourced. Not a Web Data Service
# cube: the 2016 topic-based tabulations are published as SDMX through the open
# government portal, which is why this one carries a literal URL rather than
# going through statcan() above.
RES_2016 = Source(
    key="res_industry_2016",
    title=("Statistics Canada. 2016 Census - Place of Work Status (5), Industry "
           "- NAICS 2012 (21), Occupation - NOC 2016 (11) and Sex (3) for the "
           "Employed Labour Force Aged 15 Years and Over in Private Households "
           "of Canada, Provinces and Territories, Census Divisions and Census "
           "Subdivisions. Catalogue 98-400-X2016321."),
    url="https://www12.statcan.gc.ca/open-gc-ouvert/2017/98-400-X2016321.ZIP",
    purpose=("The 2016 leg of the five-census shift-share series, and the "
             "reason the series is now comparable across its most-used period. "
             "This is the exact structural twin of the 2021 table 98-10-0456: "
             "same employed-labour-force universe, same five place-of-work-"
             "status categories, same twenty NAICS sectors, same residence "
             "geography. It replaces the 2016 Census Profile figures, which "
             "counted the wider labour force and so could not be differenced "
             "against 2021 without a definitional break landing on the "
             "industry-mix and competitive terms."),
    caveats=("Residence geography with a place-of-work-STATUS dimension - it "
             "counts where workers live, not where the jobs are. 25% sample "
             "data, so it carries long-form sampling error on top of random "
             "rounding. NAICS 2012, against NAICS 2017 in 2021; sector-level "
             "codes are stable but not identical. Restricted to the employed "
             "labour force in PRIVATE HOUSEHOLDS, which is a marginally "
             "narrower universe than the 2021 table and understates places "
             "with large institutional populations. Published as an 8.4 GB "
             "SDMX file that is streamed rather than stored."),
    vintage="2016",
    filename="98-400-X2016321.ZIP",
    cite=("Statistics Canada. 2016 Census of Population, Catalogue no. "
          "98-400-X2016321."))

SOURCES.append(RES_2016)


LEGACY_SERIES = [
    ("census2001",
     "Statistics Canada. 2001 Census - Profile of census subdivisions, catalogue "
     "95F0495XCB2001001. Labour force 15+ by industry (NAICS 1997)."),
    ("census2006",
     "Statistics Canada. 2006 Census - Profile of census subdivisions, catalogue "
     "94-581-XCB2006001. Labour force 15+ by industry (NAICS 2002)."),
    ("nhs2011",
     "Statistics Canada. 2011 National Household Survey - catalogue "
     "99-004-XWE2011001. Labour force 15+ by industry (NAICS 2007)."),
]

SOURCE_BY_KEY = dict((s.key, s) for s in SOURCES)
