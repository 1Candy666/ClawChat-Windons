`pptxgen.js` 是 [PptxGenJS](https://github.com/gitbrent/PptxGenJS) 4.0.1（MIT）及其依赖
[JSZip](https://github.com/Stuk/jszip)（MIT 或 GPLv3 双许可，这里按 MIT 使用）、
[image-size](https://github.com/image-size/image-size)（MIT）用 esbuild 打包成的单个文件，
用来生成组会汇报的 .pptx。各自的版权和许可声明保留在文件内。

**本地修改**：PptxGenJS 4.0.1 在一个段落里有多段不同格式的文字时，会为每段都写一个 `<a:pPr>`，生成不合规的 XML（PowerPoint 可能提示修复，项目符号丢失）。这里改成每个段落只写一次（搜索 `ClawChat patch`）。
