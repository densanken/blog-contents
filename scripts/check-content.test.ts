import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import sharp from "sharp";

import { checkContents } from "./content/validate.ts";

const fixture = async (fn: (root: string) => unknown) => {
  const root = mkdtempSync(join(tmpdir(), "blog-contents-"));

  try {
    mkdirSync(join(root, "author"));
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\n");
    writeFileSync(join(root, "author/meta.yaml"), "editors:\n  - example\n");
    writeFileSync(join(root, "author/post.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\nBody\n");

    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const png = () =>
  sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } })
    .png()
    .toBuffer();

// 1x1 画素のフレームを frames 枚並べた GIF
const gif = (frames: number) =>
  Buffer.concat([
    Buffer.from("47494638396101000100800000ffffff000000", "hex"),
    ...Array.from({ length: frames }, () => Buffer.from("2c0000000001000100000202440100", "hex")),
    Buffer.from("3b", "hex"),
  ]);

const bad = async (root: string, name: string, data: Buffer | string, pattern: RegExp) => {
  mkdirSync(join(root, "author/assets"), { recursive: true });
  writeFileSync(join(root, "author/assets", name), data);

  assert.match((await checkContents(root)).join("\n"), pattern);
};

test("有効なコンテンツを受け付ける", () =>
  fixture(async (root) => {
    assert.deepEqual(await checkContents(root), []);
  }));

test("不正な項目と YAML の重複キーを報告する", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/post.md"),
      "---\ntitle: Hello\ntitle: Again\ndate: 2026-02-30\n---\n"
    );
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\nwebsite: http://example.com\n");
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /YAML が不正/);
    assert.match(errors, /website が不正/);
  }));

test("不正な日付、プロフィールの欠落、シンボリックリンクを拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/post.md"), "---\ntitle: Hello\ndate: 2026-02-30\n---\n");
    mkdirSync(join(root, "other"));
    symlinkSync("post.md", join(root, "author/link.md"));
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /date は/);
    assert.match(errors, /profile.yaml/);
    assert.match(errors, /シンボリックリンク/);
  }));

test("大文字の Markdown 拡張子を拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/upper.MD"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");

    assert.match((await checkContents(root)).join("\n"), /拡張子は小文字/);
  }));

test("profile.yml と meta.yml を受け付ける", () =>
  fixture(async (root) => {
    rmSync(join(root, "author/profile.yaml"));
    rmSync(join(root, "author/meta.yaml"));
    writeFileSync(join(root, "author/profile.yml"), "name: Author\nicon: assets/icon.PNG\n");
    writeFileSync(join(root, "author/meta.yml"), "editors:\n  - example\n");
    mkdirSync(join(root, "author/assets"));
    writeFileSync(join(root, "author/assets/icon.PNG"), await png());

    assert.deepEqual(await checkContents(root), []);
  }));

test("プロフィールの重複と未対応のファイル形式を報告する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/profile.yml"), "name: Author\n");
    writeFileSync(join(root, "author/meta.yml"), "editors:\n  - example\n");
    writeFileSync(join(root, "author/image.svg"), "<svg/>");
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /profile.yaml または profile.yml/);
    assert.match(errors, /meta.yaml または meta.yml/);
    assert.match(errors, /許可されていない拡張子/);
  }));

test("プロフィールと対になるメタデータを必須にする", () =>
  fixture(async (root) => {
    rmSync(join(root, "author/meta.yaml"));

    assert.match((await checkContents(root)).join("\n"), /meta.yaml または meta.yml/);
  }));

test("ディレクトリをプロフィールやメタデータのファイルとして扱わない", () =>
  fixture(async (root) => {
    rmSync(join(root, "author/profile.yaml"));
    rmSync(join(root, "author/meta.yaml"));
    mkdirSync(join(root, "author/profile.yaml"));
    mkdirSync(join(root, "author/meta.yaml"));
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /profile.yaml または profile.yml/);
    assert.match(errors, /meta.yaml または meta.yml/);
  }));

test("未知の frontmatter と YAML の項目を報告する", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/post.md"),
      "---\ntitle: Hello\ndate: 2026-01-01\ntitel: typo\n---\n"
    );
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\nwebiste: typo\n");
    writeFileSync(join(root, "author/meta.yaml"), "editors: [example]\neditor: typo\n");

    const errors = (await checkContents(root)).join("\n");
    assert.match(errors, /未対応の項目です: titel/);
    assert.match(errors, /未対応の項目です: webiste/);
    assert.match(errors, /未対応の項目です: editor/);
  }));

test("名前に半角英数字とハイフン以外を使うと報告する", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "author_name"));
    mkdirSync(join(root, "author", "画像"));
    writeFileSync(join(root, "author", "bad_name.md"), "image");
    writeFileSync(join(root, "author", "bad name.md"), "image");

    const errors = (await checkContents(root)).join("\n");
    assert.match(errors, /author_name: 名前には/);
    assert.match(errors, /画像: 名前には/);
    assert.match(errors, /bad_name.md: 名前には/);
    assert.match(errors, /bad name.md: 名前には/);
  }));

test("素材のサブディレクトリとハイフンを含む名前を受け付ける", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "author/assets/nested-folder"), { recursive: true });
    writeFileSync(join(root, "author/assets/nested-folder/image-1.png"), await png());

    assert.deepEqual(await checkContents(root), []);
  }));

test("CLI は authors を検証対象にする", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "authors"));
    renameSync(join(root, "author"), join(root, "authors", "Author-1"));
    mkdirSync(join(root, "unrelated_directory"));

    const script = resolve("scripts/check-content.ts");
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }));

test("authors 直下の記事や未対応ファイルを拒否し README は許可する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "post.md"), "本文");
    writeFileSync(join(root, "bad.exe"), "file");
    writeFileSync(join(root, "README.md"), "説明");

    const errors = (await checkContents(root)).join("\n");
    assert.match(errors, /post.md: authors の直下/);
    assert.match(errors, /bad.exe: authors の直下/);
    assert.doesNotMatch(errors, /^README.md:/m);
  }));

test("編集者に GitHub ユーザーとチーム slug を指定できる", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/meta.yaml"),
      "editors:\n  - Example-User\n  - team:team-a\n  - team:long_team-name\n"
    );

    assert.deepEqual(await checkContents(root), []);
  }));

test("空や不正なチーム指定を拒否する", () =>
  fixture(async (root) => {
    for (const invalid of [
      "team:",
      "team:---",
      "team:team:a",
      "teams:team-a",
      "team:space name",
      "team:チーム",
      "-bad",
      "bad-",
      "a".repeat(40),
    ]) {
      writeFileSync(join(root, "author/meta.yaml"), `editors: ["${invalid}"]\n`);

      assert.match((await checkContents(root)).join("\n"), /editors は/);
    }
  }));

test("assets 以外のサブディレクトリを、中身ごと拒否する", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "author/notes"));
    writeFileSync(
      join(root, "author/notes/draft.md"),
      "---\ntitle: Hello\ndate: 2026-01-01\n---\n"
    );
    mkdirSync(join(root, "author/Page"));
    writeFileSync(join(root, "author/Page/post.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");
    const errors = await checkContents(root);

    assert.equal(errors.length, 2);
    assert.match(
      errors.join("\n"),
      /author\/notes: 著者ディレクトリ直下に置けるサブディレクトリは assets だけ/
    );
    assert.match(
      errors.join("\n"),
      /author\/Page: 著者ディレクトリ直下に置けるサブディレクトリは assets だけ/
    );
  }));

test("大きすぎる記事を拒否する", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/post.md"),
      `---\ntitle: Hello\ndate: 2026-01-01\n---\n${"a".repeat(500_000)}`
    );

    assert.match((await checkContents(root)).join("\n"), /記事が大きすぎます/);
  }));

test("空のディレクトリ（checkout したサブモジュール）を拒否する", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "author/assets"));

    assert.match((await checkContents(root)).join("\n"), /author\/assets: 空のディレクトリ/);
  }));

test("大文字と小文字だけが違う名前を拒否する", (t) =>
  fixture(async (root) => {
    mkdirSync(join(root, "Author"), { recursive: true });
    if ((await checkContents(root)).length === 0) {
      t.skip("大文字と小文字を区別しないファイルシステムでは作れない");
      return;
    }

    writeFileSync(join(root, "Author/profile.yaml"), "name: Author\n");
    writeFileSync(join(root, "Author/meta.yaml"), "editors:\n  - example\n");

    assert.match((await checkContents(root)).join("\n"), /大文字と小文字だけが違う名前/);
  }));

test("著者 ID の page を大文字と小文字を区別せずに拒否する", () =>
  fixture(async (root) => {
    renameSync(join(root, "author"), join(root, "Page"));

    assert.match((await checkContents(root)).join("\n"), /Page: page は著者 ID/);
  }));

test("空の editors を拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/meta.yaml"), "editors: []\n");

    assert.match((await checkContents(root)).join("\n"), /editors は/);
  }));

test("assets の外の画像と assets の下の記事や YAML を拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/outside.png"), await png());
    mkdirSync(join(root, "author/assets"));
    writeFileSync(join(root, "author/assets/post.md"), "本文");
    writeFileSync(join(root, "author/assets/extra.yaml"), "a: 1\n");
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /outside.png: 画像は assets\/ の下/);
    assert.match(errors, /assets\/post.md: assets\/ の下には画像だけ/);
    assert.match(errors, /assets\/extra.yaml: assets\/ の下には画像だけ/);
  }));

test("すべての形式の画像を assets で受け付ける", () =>
  fixture(async (root) => {
    const image = sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } });
    mkdirSync(join(root, "author/assets"));
    for (const [name, data] of [
      ["a.jpg", image.clone().jpeg()],
      ["b.jpeg", image.clone().jpeg()],
      ["c.gif", image.clone().gif()],
      ["d.webp", image.clone().webp()],
      ["e.avif", image.clone().avif()],
    ] as const)
      writeFileSync(join(root, "author/assets", name), await data.toBuffer());

    assert.deepEqual(await checkContents(root), []);
  }));

test("拡張子と形式が違う画像を拒否する", () =>
  fixture(async (root) =>
    bad(root, "image.jpg", await png(), /image.jpg: 拡張子（.jpg）と画像の形式（png）/)
  ));

test("画像に見せかけた別形式のファイルを拒否する", () =>
  fixture((root) =>
    bad(root, "image.png", "<svg/>", /image.png: PNG, JPEG, GIF, WebP, AVIF のどれでもありません/)
  ));

test("壊れた画像を拒否する", () =>
  fixture(async (root) =>
    bad(root, "image.png", (await png()).subarray(0, 40), /image.png: 画像を展開できません/)
  ));

test("画素数が上限を超える画像をヘッダーだけで拒否する", () =>
  fixture(async (root) => {
    // 10 万 x 10 万画素と宣言する PNG のヘッダー
    const header = Buffer.from(await png());
    header.writeUInt32BE(100_000, 16);
    header.writeUInt32BE(100_000, 20);

    await bad(root, "image.png", header, /image.png: 画素数が多すぎます/);
  }));

test("フレーム数が上限を超えるアニメーションを拒否する", () =>
  fixture(async (root) => bad(root, "image.gif", gif(201), /image.gif: フレーム数または/)));

test("page.md と . を含む記事のパスを拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/Page.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");
    writeFileSync(join(root, "author/a.b.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");
    const errors = (await checkContents(root)).join("\n");

    assert.match(errors, /Page.md: 記事のファイル名に page/);
    assert.match(errors, /a\.b\.md: 記事のファイル名に \. は使えません/);
  }));

test("2 MiB を超えるファイルを拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/profile.yaml"), `name: ${"a".repeat(2 * 1024 * 1024)}\n`);

    assert.match((await checkContents(root)).join("\n"), /profile.yaml: ファイルが大きすぎます/);
  }));

test("ヘッダーを読めない画像を拒否する", () =>
  fixture((root) =>
    bad(
      root,
      "image.png",
      Buffer.from("89504e470d0a1a0a00000000", "hex"),
      /image.png: 画像のヘッダーを読めません/
    )
  ));

test("最初の \\n--- で frontmatter が空になる記事を拒否する", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/post.md"),
      "---\n--- \ntitle: Hello\ndate: 2026-01-01\n---\nBody\n"
    );

    assert.match(
      (await checkContents(root)).join("\n"),
      /post.md: ファイルの先頭に --- で囲んだ frontmatter/
    );
  }));

test("BOM で始まる記事を、ブログと同じく frontmatter なしとして拒否する", () =>
  fixture(async (root) => {
    writeFileSync(
      join(root, "author/post.md"),
      "\uFEFF---\ntitle: Hello\ndate: 2026-01-01\n---\nBody\n"
    );

    assert.match((await checkContents(root)).join("\n"), /post.md: ファイルの先頭に --- で囲んだ/);
  }));

test("存在しないローカルのアイコンを拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\nicon: assets/none.png\n");

    assert.match((await checkContents(root)).join("\n"), /profile.yaml: icon が不正/);
  }));

test("存在しない alias などの YAML のエラーで落ちずに報告する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\nbio: *nope\n");

    assert.match((await checkContents(root)).join("\n"), /profile.yaml: YAML が不正です/);
  }));

test("assets の外を指すローカルのアイコンを拒否する", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\nicon: assets/../post.md\n");

    assert.match((await checkContents(root)).join("\n"), /profile.yaml: icon が不正/);
  }));

test("大文字と小文字だけが違う記事を拒否する", (t) =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/Post.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");
    if ((await checkContents(root)).length === 0) {
      t.skip("大文字と小文字を区別しないファイルシステムでは作れない");
      return;
    }

    assert.match((await checkContents(root)).join("\n"), /大文字と小文字だけが違う名前/);
  }));

test("ピリオドを含むディレクトリ名を拒否する", () =>
  fixture(async (root) => {
    mkdirSync(join(root, "author/v1.0"));
    writeFileSync(join(root, "author/v1.0/post.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");

    assert.match((await checkContents(root)).join("\n"), /v1\.0: 名前には/);
  }));

test("pinned に同じ著者の記事のスラッグを大文字と小文字を区別せずに指定できる", () =>
  fixture(async (root) => {
    writeFileSync(join(root, "author/draft.md"), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");
    writeFileSync(join(root, "author/profile.yaml"), "name: Author\npinned: [Post, DRAFT]\n");

    assert.deepEqual(await checkContents(root), []);
  }));

test("admissionYear は 4 文字以内の半角数字だけを受け付ける", () =>
  fixture(async (root) => {
    for (const valid of ["2024", '"2024"', "99", "0"]) {
      writeFileSync(join(root, "author/profile.yaml"), `name: Author\nadmissionYear: ${valid}\n`);

      assert.deepEqual(await checkContents(root), [], valid);
    }

    for (const invalid of ["20245", '"２０２４"', '"2024年"', "-1", "2024.5", "[2024]", '""']) {
      writeFileSync(join(root, "author/profile.yaml"), `name: Author\nadmissionYear: ${invalid}\n`);

      assert.match((await checkContents(root)).join("\n"), /admissionYear が不正/, invalid);
    }
  }));

test("不正な pinned を拒否する", () =>
  fixture(async (root) => {
    for (const name of ["post2", "post3", "post4"])
      writeFileSync(join(root, `author/${name}.md`), "---\ntitle: Hello\ndate: 2026-01-01\n---\n");

    for (const invalid of [
      "post",
      "[1]",
      "[none]",
      "[post, POST]",
      "[post, post2, post3, post4]",
    ]) {
      writeFileSync(join(root, "author/profile.yaml"), `name: Author\npinned: ${invalid}\n`);

      assert.match((await checkContents(root)).join("\n"), /profile.yaml: pinned が不正/, invalid);
    }
  }));

test("authors がなくても成功する", async () => {
  const root = mkdtempSync(join(tmpdir(), "blog-contents-"));

  try {
    assert.deepEqual(await checkContents(join(root, "authors")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
