class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.4.6.tgz"
  sha256 "4e49c7e9b7b3de812ff19db2b36239a46e4361bbeb9a849e6311d6542dd23e5e"
  license "MIT"

  depends_on "node"
  depends_on "ollama"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Podium starts Ollama automatically on launch. Just run:
        podium
    EOS
  end

  test do
    assert_match "podium", shell_output("#{bin}/podium --help")
  end
end
