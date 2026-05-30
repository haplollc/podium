class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.4.7.tgz"
  sha256 "cad10f24a2efe5330d7618678f2c660a727c9d75881adba5652076d13e938126"
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
