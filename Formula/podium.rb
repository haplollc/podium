class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.3.5.tgz"
  sha256 "e933c7b61e28d872bbb986844460b1dcc7541ba519fd87426e606973577e340d"
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
