"""Add Inno's UI-language detection and all available official translations."""
from pathlib import Path


def localize(script: Path, compiler: Path, extras: Path):
    text = script.read_text(encoding="utf-8-sig")
    if "[Languages]" in text or "procedure InitializeWizard" in text:
        raise ValueError("The nsh installer template changed; review its language initialization")
    files = {p.stem: p for p in (compiler.parent / "Languages").glob("*.isl")}
    files.update({p.stem: p for p in extras.glob("*.isl")})
    if not {"ChineseSimplified", "ChineseTraditional"}.issubset(files):
        raise ValueError("Both Chinese translations are required")
    languages = ['Name: "english"; MessagesFile: "compiler:Default.isl"']
    for name, path in sorted(files.items()):
        languages.append(f'Name: "{name.lower()}"; MessagesFile: "{path.resolve()}"')
    # Ignore the old installation's language when Windows' display language changed.
    text = text.replace("[Setup]\n", "[Setup]\nLanguageDetectionMethod=uilanguage\nShowLanguageDialog=no\nUsePreviousLanguage=no\n", 1)
    text = text.replace("[Tasks]\n", "[Languages]\n" + "\n".join(languages) + "\n\n[Tasks]\n", 1)
    text = text.replace("[Code]\n", "[Code]\nprocedure InitializeWizard;\nbegin\n  Log('FuxWX installer language: ' + ActiveLanguage + '; Windows UI: ' + IntToStr(GetUILanguage));\nend;\n\n", 1)
    script.write_text(text, encoding="utf-8", newline="\n")
    return ["english", *(name.lower() for name in sorted(files))]
