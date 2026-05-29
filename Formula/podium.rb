class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.1.0.tgz"
  sha256 "9c166433bbbc4a69673a1d15f1d7513dd385c15aa15294b6a0d52923ef67e71b"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "podium", shell_output("#{bin}/podium --help")
  end
end
