"""Convert the supplied XLSX into the read-only explorer's source dataset.

Uses Python's standard library; retains distinct offering rows and null values.
"""
import json
import math
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "attached_assets/clean_nyu_course_evaluations_per_item_1794068768075.xlsx"
DEST = ROOT / "artifacts/course-insights/public/data/evaluations.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def column_index(reference):
    index = 0
    for char in re.match(r"[A-Z]+", reference).group():
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


with zipfile.ZipFile(SOURCE) as archive:
    strings = [
        "".join(node.itertext())
        for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)
    ]

    def read_sheet(name, width):
        root = ET.fromstring(archive.read(name))
        result = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            values = [None] * width
            for cell in row:
                index = column_index(cell.attrib["r"])
                value_node = cell.find("m:v", NS)
                value = value_node.text if value_node is not None else None
                if cell.attrib.get("t") == "s" and value is not None:
                    value = strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(cell.itertext())
                if index < width:
                    values[index] = value
            result.append(values)
        return result

    rows = read_sheet("xl/worksheets/sheet1.xml", 19)
    notes = read_sheet("xl/worksheets/sheet2.xml", 2)
    records = []
    for index, row in enumerate(rows[1:], start=1):
        if not row[0] or not row[1]:
            raise ValueError(f"Missing course/professor on row {index + 1}")
        scores = [numeric(value) for value in row[9:19]]
        if any(value is not None and not 1 <= value <= 5 for value in scores):
            raise ValueError(f"Out-of-range score on row {index + 1}")
        records.append({
            "id": index,
            "course": row[0].strip(),
            "professor": row[1].strip(),
            "semester": row[2].strip(),
            "enrolled": numeric(row[3]),
            "responded": numeric(row[4]),
            "scores": scores,
            "inaccessible": any(value == "INACCESSIBLE" for value in row),
        })
    data = {
        "questions": [value.strip() for value in rows[0][9:19]],
        "records": records,
        "sourceNotes": [f"{row[0]}: {row[1]}" for row in notes if row[0] and row[1]],
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({
        "offerings": len(records),
        "professors": len({row["professor"] for row in records}),
        "courses": len({row["course"] for row in records}),
        "semesters": sorted({row["semester"] for row in records}),
        "inaccessible": sum(row["inaccessible"] for row in records),
        "zeroResponses": sum(row["responded"] == 0 for row in records),
        "sourceNotes": data["sourceNotes"],
        "bytes": DEST.stat().st_size,
    }, indent=2))
