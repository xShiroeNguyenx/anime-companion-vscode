# Anime Companion VS Code

Anime Companion la mot extension cho Visual Studio Code, mang den mot nhan vat Live2D dong hanh trong luc ban code. Extension co the hien companion trong panel, phan ung voi tuong tac, va ho tro cac nhac nho nhe nhang trong qua trinh lam viec.

## Tinh Nang Noi Bat

- Live2D renderer bang WebGL voi Pixi.js.
- Bieu cam va phan ung theo thao tac cua nguoi dung.
- Tuong tac click, headpat, va spam click.
- Ho tro nhieu giong noi: `ja`, `vi`, `en`.
- Tich hop command de show, hide, toggle, doi model, va pomodoro.

## Cai Dat Va Cau Hinh

Mo VS Code Settings va tim `Anime Companion` de tuy chinh:

- `Anime Companion: Model`
- `Anime Companion: Voice Language`
- `Anime Companion: Show On Startup`
- `Anime Companion: Character Size`
- `Anime Companion: Break Reminder Minutes`

## Tai Lieu Chi Tiet

- [FEATURES.md](./FEATURES.md) - Mo ta them ve tinh nang.
- [DECISIONS.md](./DECISIONS.md) - Ghi chu ve kien truc va quyet dinh ky thuat.
- [PLAN.md](./PLAN.md) - Dinh huong phat trien tiep theo.
- [CHECKLIST.md](./CHECKLIST.md) - Tien do du an.

## Huong Dan Phat Trien

Du an can `Node.js` va `npm`.

1. Cai dependency:
   ```bash
   npm install
   ```
2. Nhan `F5` de mo Extension Development Host trong che do dev.
3. Build VSIX:
   ```bash
   npm run compile
   npx vsce package --allow-missing-repository
   ```
4. Build va cai de lai extension trong VS Code:
   ```bash
   npm run package:install
   ```

## Scripts Huu Ich

- `npm run compile`: build TypeScript.
- `npm run watch`: watch va build lai khi file thay doi.
- `npm run package`: tao file `.vsix`.
- `npm run package:install`: package xong cai de lai extension vao VS Code.
